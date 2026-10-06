package com.momentsforever.photolibrary

import android.content.ContentResolver
import android.content.ContentUris
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.os.Build
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface
import java.time.Instant

/**
 * MediaStore reads for the "find trips" feature. Metadata only: no bitmap is
 * ever decoded. GPS is NOT a MediaStore column on Android 10+, so it is read
 * from the file's EXIF (needs ACCESS_MEDIA_LOCATION) and only for the sample
 * that is returned — opening every file of a big library would be slow.
 */
object PhotoLibraryScanner {

    data class Asset(
        val localIdentifier: String,
        val creationDate: String?,
        val latitude: Double?,
        val longitude: Double?,
        val width: Int,
        val height: Int,
        val mediaType: String,
    )

    data class Output(
        val assets: List<Asset>,
        val totalAssets: Int,
        val scannedAssets: Int,
        val withDate: Int,
        val withoutDate: Int,
        val locationChecked: Int,
        val withLocation: Int,
        val withoutLocation: Int,
        val scanDurationMs: Long,
    )

    data class Counts(val photos: Int, val videos: Int, val durationMs: Long)

    private val IMAGES: Uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    private val VIDEOS: Uri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI

    fun counts(resolver: ContentResolver): Counts {
        val started = System.nanoTime()
        val photos = count(resolver, IMAGES)
        val videos = count(resolver, VIDEOS)
        return Counts(photos, videos, (System.nanoTime() - started) / 1_000_000)
    }

    private fun count(resolver: ContentResolver, uri: Uri): Int =
        resolver.query(uri, arrayOf(MediaStore.MediaColumns._ID), null, null, null)
            ?.use { it.count } ?: 0

    fun scan(
        resolver: ContentResolver,
        limit: Int,
        offset: Int,
        newestFirst: Boolean,
        includeVideos: Boolean,
        readExifLocation: Boolean,
    ): Output {
        val started = System.nanoTime()
        val rows = ArrayList<Asset>()
        var total = 0
        var scanned = 0
        var withDate = 0
        var withoutDate = 0
        var locationChecked = 0
        var withLocation = 0
        var withoutLocation = 0

        val sources = if (includeVideos) listOf(IMAGES to "image", VIDEOS to "video") else listOf(IMAGES to "image")
        val order = "${MediaStore.MediaColumns.DATE_TAKEN} ${if (newestFirst) "DESC" else "ASC"}"
        val windowStart = offset.coerceAtLeast(0)
        val windowEnd = windowStart + limit.coerceAtLeast(0)
        var index = 0

        for ((uri, mediaType) in sources) {
            val projection = arrayOf(
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DATE_TAKEN,
                MediaStore.MediaColumns.WIDTH,
                MediaStore.MediaColumns.HEIGHT,
            )
            resolver.query(uri, projection, null, null, order)?.use { cursor ->
                total += cursor.count
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val takenCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_TAKEN)
                val widthCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.WIDTH)
                val heightCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.HEIGHT)
                while (cursor.moveToNext()) {
                    scanned += 1
                    val takenMs = if (cursor.isNull(takenCol)) 0L else cursor.getLong(takenCol)
                    val date = if (takenMs > 0L) Instant.ofEpochMilli(takenMs).toString() else null
                    if (date != null) withDate += 1 else withoutDate += 1

                    val position = index
                    index += 1
                    if (position < windowStart || position >= windowEnd) continue

                    val id = cursor.getLong(idCol)
                    var lat: Double? = null
                    var lon: Double? = null
                    if (readExifLocation && mediaType == "image") {
                        locationChecked += 1
                        val latLong = readLocation(resolver, ContentUris.withAppendedId(uri, id))
                        if (latLong != null) {
                            lat = latLong[0]
                            lon = latLong[1]
                            withLocation += 1
                        } else {
                            withoutLocation += 1
                        }
                    }
                    rows.add(
                        Asset(
                            localIdentifier = id.toString(),
                            creationDate = date,
                            latitude = lat,
                            longitude = lon,
                            width = cursor.getInt(widthCol),
                            height = cursor.getInt(heightCol),
                            mediaType = mediaType,
                        ),
                    )
                }
            }
        }

        return Output(
            assets = rows,
            totalAssets = total,
            scannedAssets = scanned,
            withDate = withDate,
            withoutDate = withoutDate,
            locationChecked = locationChecked,
            withLocation = withLocation,
            withoutLocation = withoutLocation,
            scanDurationMs = (System.nanoTime() - started) / 1_000_000,
        )
    }

    /** GPS from the original file; null when absent or the app may not read it. */
    private fun readLocation(resolver: ContentResolver, uri: Uri): DoubleArray? {
        val source = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) MediaStore.setRequireOriginal(uri) else uri
        return try {
            resolver.openInputStream(source)?.use { ExifInterface(it).latLong }
        } catch (_: Exception) {
            // UnsupportedOperationException / SecurityException (no ACCESS_MEDIA_LOCATION), IOException.
            null
        }
    }

    // --- pixels: only for photos the person is looking at / chose to add ---------

    data class Exported(val base64: String, val width: Int, val height: Int, val bytes: Int)

    private fun imageUri(id: Long): Uri = ContentUris.withAppendedId(IMAGES, id)

    /** Decodes at most `maxEdge` px on the long side (sub-sampled, so memory stays small) and upright. */
    fun decodeScaled(resolver: ContentResolver, id: Long, maxEdge: Int): Bitmap? {
        val uri = imageUri(id)
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2
            val decoded = resolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            } ?: return null

            val rotation = resolver.openInputStream(uri)?.use { stream ->
                when (ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                    else -> 0f
                }
            } ?: 0f

            val longest = maxOf(decoded.width, decoded.height)
            val scale = if (longest > maxEdge) maxEdge.toFloat() / longest else 1f
            if (rotation == 0f && scale == 1f) return decoded
            val matrix = Matrix().apply {
                postScale(scale, scale)
                postRotate(rotation)
            }
            Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        } catch (_: Exception) {
            null
        }
    }

    private fun encodeJpeg(bitmap: Bitmap, quality: Int): ByteArray =
        ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()

    fun thumbnailBase64(resolver: ContentResolver, id: Long, size: Int): String? {
        val bitmap = decodeScaled(resolver, id, size) ?: return null
        return Base64.encodeToString(encodeJpeg(bitmap, 70), Base64.NO_WRAP).also { bitmap.recycle() }
    }

    /**
     * Reduced JPEG for the upload pipeline. Android's re-encode drops EXIF, which
     * is fine: the app takes date and GPS from the scan (see LibraryAsset), not
     * from the file.
     */
    fun exportJpeg(resolver: ContentResolver, id: Long, maxEdge: Int, quality: Int): Exported? {
        val bitmap = decodeScaled(resolver, id, maxEdge) ?: return null
        val bytes = encodeJpeg(bitmap, quality)
        val result = Exported(Base64.encodeToString(bytes, Base64.NO_WRAP), bitmap.width, bitmap.height, bytes.size)
        bitmap.recycle()
        return result
    }
}

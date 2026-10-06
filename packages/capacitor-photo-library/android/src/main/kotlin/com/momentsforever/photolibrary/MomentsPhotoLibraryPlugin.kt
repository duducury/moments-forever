package com.momentsforever.photolibrary

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

/**
 * Capacitor bridge for the photo-library prototype (Android half).
 * Read-only; returns metadata, never image data. Uses MediaStore rather than
 * the Photo Picker because the picker only hands back what the user taps —
 * it cannot enumerate the library to discover trips.
 */
@CapacitorPlugin(
    name = "MomentsPhotoLibrary",
    permissions = [
        Permission(strings = [Manifest.permission.READ_EXTERNAL_STORAGE], alias = "legacyStorage"),
        Permission(strings = [Manifest.permission.READ_MEDIA_IMAGES], alias = "images"),
        Permission(strings = [Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED], alias = "userSelected"),
        Permission(strings = [Manifest.permission.ACCESS_MEDIA_LOCATION], alias = "mediaLocation"),
    ],
)
class MomentsPhotoLibraryPlugin : Plugin() {

    private val prefs get() = context.getSharedPreferences("moments_photo_library", Context.MODE_PRIVATE)

    private fun granted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    /** granted | limited | denied | notDetermined — Android cannot always tell the last two apart. */
    private fun status(): String {
        val sdk = Build.VERSION.SDK_INT
        val full = when {
            sdk >= Build.VERSION_CODES.TIRAMISU -> granted(Manifest.permission.READ_MEDIA_IMAGES)
            else -> granted(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        if (full) return "granted"
        if (sdk >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
        ) {
            return "limited"
        }
        return if (prefs.getBoolean("asked", false)) "denied" else "notDetermined"
    }

    private fun permissionResult(): JSObject = JSObject().apply {
        put("status", status())
        put("detail", "Android SDK ${Build.VERSION.SDK_INT}")
    }

    private fun readable(): Boolean = status().let { it == "granted" || it == "limited" }

    private fun rejectDenied(call: PluginCall) =
        call.reject("Photo library access is ${status()}.", "PERMISSION_DENIED")

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        call.resolve(permissionResult())
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (readable()) {
            call.resolve(permissionResult())
            return
        }
        prefs.edit().putBoolean("asked", true).apply()
        val aliases = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE ->
                arrayOf("images", "userSelected", "mediaLocation")
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> arrayOf("images", "mediaLocation")
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> arrayOf("legacyStorage", "mediaLocation")
            else -> arrayOf("legacyStorage")
        }
        requestPermissionForAliases(aliases, call, "permissionsCallback")
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        call.resolve(permissionResult())
    }

    /** Android 14+ "limited": asking again lets the user pick more photos. */
    @PluginMethod
    fun presentLimitedLibraryPicker(call: PluginCall) {
        if (status() != "limited") {
            call.resolve(JSObject().put("presented", false).put("reason", "library_is_not_in_limited_mode"))
            return
        }
        requestPermissionForAliases(arrayOf("images", "userSelected"), call, "limitedPickerCallback")
    }

    @PermissionCallback
    private fun limitedPickerCallback(call: PluginCall) {
        call.resolve(JSObject().put("presented", true))
    }

    @PluginMethod
    fun getPhotoLibrarySummary(call: PluginCall) {
        if (!readable()) return rejectDenied(call)
        Thread {
            val counts = PhotoLibraryScanner.counts(context.contentResolver)
            call.resolve(
                JSObject().apply {
                    put("permissionStatus", status())
                    put("platform", "android")
                    put("photoCount", counts.photos)
                    put("videoCount", counts.videos)
                    put("totalAssets", counts.photos + counts.videos)
                    put("durationMs", counts.durationMs)
                },
            )
        }.start()
    }

    @PluginMethod
    fun scanPhotoMetadata(call: PluginCall) {
        if (!readable()) return rejectDenied(call)
        val limit = (call.getInt("limit") ?: 100).coerceIn(0, 50_000)
        val offset = (call.getInt("offset") ?: 0).coerceAtLeast(0)
        val newestFirst = call.getBoolean("newestFirst") ?: true
        val includeVideos = call.getBoolean("includeVideos") ?: false
        val readExif = (call.getBoolean("readExifLocation") ?: false) &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || granted(Manifest.permission.ACCESS_MEDIA_LOCATION))

        Thread {
            val out = PhotoLibraryScanner.scan(
                context.contentResolver, limit, offset, newestFirst, includeVideos, readExif,
            )
            val assets = JSArray()
            for (asset in out.assets) {
                assets.put(
                    JSObject().apply {
                        put("localIdentifier", asset.localIdentifier)
                        put("creationDate", asset.creationDate ?: JSONObject.NULL)
                        put("latitude", asset.latitude ?: JSONObject.NULL)
                        put("longitude", asset.longitude ?: JSONObject.NULL)
                        put("width", asset.width)
                        put("height", asset.height)
                        put("mediaType", asset.mediaType)
                    },
                )
            }
            val notes = JSArray()
            if (status() == "limited") notes.put("Acesso parcial: só as fotos escolhidas pelo usuário são visíveis.")
            if (!readExif) {
                notes.put("GPS não lido (readExifLocation desligado ou sem permissão ACCESS_MEDIA_LOCATION).")
            }
            call.resolve(
                JSObject().apply {
                    put("assets", assets)
                    put(
                        "diagnostics",
                        JSObject().apply {
                            put("permissionStatus", status())
                            put("platform", "android")
                            put("totalAssets", out.totalAssets)
                            put("scannedAssets", out.scannedAssets)
                            put("returnedAssets", out.assets.size)
                            put("scanDurationMs", out.scanDurationMs)
                            put("locationCheckedAssets", out.locationChecked)
                            put("assetsWithLocation", out.withLocation)
                            put("assetsWithoutLocation", out.withoutLocation)
                            put("assetsWithDate", out.withDate)
                            put("assetsWithoutDate", out.withoutDate)
                            put("notes", notes)
                        },
                    )
                },
            )
        }.start()
    }

    @PluginMethod
    fun getThumbnails(call: PluginCall) {
        if (!readable()) return rejectDenied(call)
        val ids = call.getArray("localIdentifiers")?.toList<String>().orEmpty().take(60)
        val size = (call.getInt("size") ?: 240).coerceIn(32, 600)
        Thread {
            val list = JSArray()
            for (identifier in ids) {
                val data = identifier.toLongOrNull()?.let { PhotoLibraryScanner.thumbnailBase64(context.contentResolver, it, size) }
                list.put(
                    JSObject().apply {
                        put("localIdentifier", identifier)
                        put("data", data ?: JSONObject.NULL)
                    },
                )
            }
            call.resolve(JSObject().put("thumbnails", list))
        }.start()
    }

    @PluginMethod
    fun exportPhoto(call: PluginCall) {
        if (!readable()) return rejectDenied(call)
        val identifier = call.getString("localIdentifier")
        val id = identifier?.toLongOrNull()
        if (identifier == null || id == null) {
            call.reject("localIdentifier is required.", "INVALID_ARGUMENT")
            return
        }
        val maxDimension = (call.getInt("maxDimension") ?: 1600).coerceIn(256, 4096)
        val quality = ((call.getDouble("quality") ?: 0.85) * 100).toInt().coerceIn(30, 100)
        Thread {
            val exported = PhotoLibraryScanner.exportJpeg(context.contentResolver, id, maxDimension, quality)
            if (exported == null) {
                call.reject("Could not prepare this photo.", "EXPORT_FAILED")
            } else {
                call.resolve(
                    JSObject().apply {
                        put("localIdentifier", identifier)
                        put("data", exported.base64)
                        put("mimeType", "image/jpeg")
                        put("width", exported.width)
                        put("height", exported.height)
                        put("bytes", exported.bytes)
                    },
                )
            }
        }.start()
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }
}

import Foundation
import Photos
import CoreLocation
import ImageIO
import UIKit

/// PhotoKit reads for the "find trips" feature. Metadata only — this file never
/// requests an image, so no pixels are decoded or held in memory.
///
/// Deliberately NOT used: PHAssetCollectionType.moment / PHCollectionListType.momentList
/// (deprecated since iOS 13) and anything that tries to reach Apple Photos' own
/// "Trips"/"Memories" (not exposed to third-party apps).
enum PhotoLibraryScanner {

    // MARK: - Permission

    static func permissionName(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .limited: return "limited"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    static func canRead(_ status: PHAuthorizationStatus) -> Bool {
        return status == .authorized || status == .limited
    }

    // MARK: - Fetch options

    private static func sourceTypes(includeCloudShared: Bool) -> PHAssetSourceType {
        // userLibrary = the user's own library, including iCloud Photos.
        // cloudShared = iCloud *Shared Albums* (other people's photos) — off by default.
        var types: PHAssetSourceType = [.typeUserLibrary, .typeiTunesSynced]
        if includeCloudShared { types.insert(.typeCloudShared) }
        return types
    }

    private static func sourceTypeName(_ type: PHAssetSourceType) -> String {
        if type.contains(.typeCloudShared) { return "cloudShared" }
        if type.contains(.typeiTunesSynced) { return "iTunesSynced" }
        if type.contains(.typeUserLibrary) { return "userLibrary" }
        return "unknown"
    }

    private static func fetchOptions(
        includeCloudShared: Bool,
        newestFirst: Bool?
    ) -> PHFetchOptions {
        let options = PHFetchOptions()
        options.includeAssetSourceTypes = sourceTypes(includeCloudShared: includeCloudShared)
        options.includeHiddenAssets = false
        if let newestFirst = newestFirst {
            options.sortDescriptors = [
                NSSortDescriptor(key: "creationDate", ascending: !newestFirst)
            ]
        }
        return options
    }

    // MARK: - Summary

    struct Summary {
        let photoCount: Int
        let videoCount: Int
        let durationMs: Int
    }

    static func summary() -> Summary {
        let started = DispatchTime.now()
        let options = fetchOptions(includeCloudShared: false, newestFirst: nil)
        let photos = PHAsset.fetchAssets(with: .image, options: options).count
        let videos = PHAsset.fetchAssets(with: .video, options: options).count
        return Summary(photoCount: photos, videoCount: videos, durationMs: elapsedMs(since: started))
    }

    // MARK: - Scan

    struct ScanRequest {
        var limit: Int = 100
        var offset: Int = 0
        var newestFirst: Bool = true
        var includeVideos: Bool = false
        var includeCloudShared: Bool = false
    }

    struct ScanOutput {
        var assets: [[String: Any]] = []
        var totalAssets: Int = 0
        var scannedAssets: Int = 0
        var withLocation: Int = 0
        var withoutLocation: Int = 0
        var withDate: Int = 0
        var withoutDate: Int = 0
        var bySourceType: [String: Int] = [:]
        var scanDurationMs: Int = 0
    }

    /// Reads metadata of every asset (cheap, in-memory properties of PHAsset) and
    /// builds dictionaries only for the requested window.
    static func scan(_ request: ScanRequest) -> ScanOutput {
        let started = DispatchTime.now()
        let options = fetchOptions(
            includeCloudShared: request.includeCloudShared,
            newestFirst: request.newestFirst
        )
        if !request.includeVideos {
            options.predicate = NSPredicate(
                format: "mediaType == %d", PHAssetMediaType.image.rawValue
            )
        }
        let result = PHAsset.fetchAssets(with: options)

        var output = ScanOutput()
        output.totalAssets = result.count

        let windowStart = max(0, request.offset)
        let windowEnd = windowStart + max(0, request.limit)
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        result.enumerateObjects { asset, index, _ in
            output.scannedAssets += 1

            let creationDate = asset.creationDate
            if creationDate != nil { output.withDate += 1 } else { output.withoutDate += 1 }

            var latitude: Double?
            var longitude: Double?
            if let coordinate = asset.location?.coordinate, CLLocationCoordinate2DIsValid(coordinate) {
                latitude = coordinate.latitude
                longitude = coordinate.longitude
                output.withLocation += 1
            } else {
                output.withoutLocation += 1
            }

            let sourceName = sourceTypeName(asset.sourceType)
            output.bySourceType[sourceName, default: 0] += 1

            guard index >= windowStart && index < windowEnd else { return }

            let item: [String: Any] = [
                "localIdentifier": asset.localIdentifier,
                "creationDate": orNull(creationDate.map { isoFormatter.string(from: $0) }),
                "latitude": orNull(latitude),
                "longitude": orNull(longitude),
                "width": asset.pixelWidth,
                "height": asset.pixelHeight,
                "mediaType": asset.mediaType == .video ? "video" : "image",
                "isScreenshot": asset.mediaSubtypes.contains(.photoScreenshot),
                "sourceType": sourceName
            ]
            output.assets.append(item)
        }

        output.scanDurationMs = elapsedMs(since: started)

        return output
    }

    // MARK: - Thumbnails

    static func assetsByIdentifier(_ identifiers: [String]) -> [String: PHAsset] {
        var map: [String: PHAsset] = [:]
        guard !identifiers.isEmpty else { return map }
        PHAsset.fetchAssets(withLocalIdentifiers: identifiers, options: nil)
            .enumerateObjects { asset, _, _ in map[asset.localIdentifier] = asset }
        return map
    }

    /// Small JPEG (base64) for a grid cell. Network is allowed so iCloud-only
    /// photos still get a picture; only a thumbnail-sized image is ever decoded.
    static func thumbnailBase64(
        for asset: PHAsset,
        size: Int,
        completion: @escaping (String?) -> Void
    ) {
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        options.isSynchronous = false

        let lock = NSLock()
        var finished = false
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: CGSize(width: size, height: size),
            contentMode: .aspectFill,
            options: options
        ) { image, info in
            if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
            lock.lock()
            let alreadyFinished = finished
            finished = true
            lock.unlock()
            if alreadyFinished { return }
            guard let image = image, let data = image.jpegData(compressionQuality: 0.7) else {
                completion(nil)
                return
            }
            completion(data.base64EncodedString())
        }
    }

    // MARK: - Export (only for photos the person chose to add)

    struct ExportedPhoto {
        let base64: String
        let width: Int
        let height: Int
        let bytes: Int
    }

    enum ExportError: Error {
        case notFound
        case unavailable(String)
        case encodingFailed
    }

    /// Reduced JPEG of ONE photo, with its EXIF/GPS kept, ready for the app's
    /// normal upload pipeline. The original is read one at a time and released,
    /// so memory stays flat no matter how many photos are exported.
    /// Blocking: call off the main thread.
    static func exportJPEG(
        asset: PHAsset,
        maxDimension: Int,
        quality: Double
    ) throws -> ExportedPhoto {
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true // iCloud originals are downloaded on demand
        options.isSynchronous = true
        options.version = .current
        options.deliveryMode = .highQualityFormat

        var imageData: Data?
        var info: [AnyHashable: Any]?
        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, resultInfo in
            imageData = data
            info = resultInfo
        }
        guard let data = imageData else {
            let reason = (info?[PHImageErrorKey] as? NSError)?.localizedDescription
                ?? "A foto não pôde ser lida (iCloud indisponível?)."
            throw ExportError.unavailable(reason)
        }

        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            throw ExportError.encodingFailed
        }
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true, // bake the rotation into the pixels
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(
            source, 0, thumbnailOptions as CFDictionary
        ) else {
            throw ExportError.encodingFailed
        }

        var properties: [CFString: Any] = [
            kCGImageDestinationLossyCompressionQuality: quality,
            kCGImagePropertyOrientation: 1
        ]
        if let original = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] {
            if var exif = original[kCGImagePropertyExifDictionary] as? [CFString: Any] {
                exif[kCGImagePropertyExifPixelXDimension] = image.width
                exif[kCGImagePropertyExifPixelYDimension] = image.height
                properties[kCGImagePropertyExifDictionary] = exif
            }
            if let gps = original[kCGImagePropertyGPSDictionary] {
                properties[kCGImagePropertyGPSDictionary] = gps
            }
            if var tiff = original[kCGImagePropertyTIFFDictionary] as? [CFString: Any] {
                tiff[kCGImagePropertyTIFFOrientation] = 1
                properties[kCGImagePropertyTIFFDictionary] = tiff
            }
        }

        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output as CFMutableData, "public.jpeg" as CFString, 1, nil
        ) else {
            throw ExportError.encodingFailed
        }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            throw ExportError.encodingFailed
        }

        let bytes = output as Data
        return ExportedPhoto(
            base64: bytes.base64EncodedString(),
            width: image.width,
            height: image.height,
            bytes: bytes.count
        )
    }

    // MARK: - Helpers

    /// Optional → JSON null, so every key is always present on the JS side.
    private static func orNull(_ value: Any?) -> Any {
        if let value = value { return value }
        return NSNull()
    }

    private static func elapsedMs(since start: DispatchTime) -> Int {
        let nanos = DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds
        return Int(nanos / 1_000_000)
    }
}

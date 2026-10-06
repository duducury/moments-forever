import Foundation
import Capacitor
import Photos
import UIKit

/// Capacitor bridge for the photo-library prototype. All methods are read-only
/// and return metadata (id, date, GPS, size) — never image data.
@objc(MomentsPhotoLibraryPlugin)
public class MomentsPhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MomentsPhotoLibraryPlugin"
    public let jsName = "MomentsPhotoLibrary"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentLimitedLibraryPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPhotoLibrarySummary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanPhotoMetadata", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getThumbnails", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private static let maxLimit = 50_000
    private static let maxThumbnailBatch = 60
    private static let maxThumbnailSize = 600

    private func currentStatus() -> PHAuthorizationStatus {
        return PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    private func permissionPayload(_ status: PHAuthorizationStatus) -> [String: Any] {
        return [
            "status": PhotoLibraryScanner.permissionName(status),
            "detail": "PHAuthorizationStatus.\(PhotoLibraryScanner.permissionName(status)) (iOS \(UIDevice.current.systemVersion))"
        ]
    }

    private func rejectDenied(_ call: CAPPluginCall, _ status: PHAuthorizationStatus) {
        call.reject(
            "Photo library access is \(PhotoLibraryScanner.permissionName(status)).",
            "PERMISSION_DENIED"
        )
    }

    @objc func checkPermission(_ call: CAPPluginCall) {
        call.resolve(permissionPayload(currentStatus()))
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            call.resolve(self.permissionPayload(status))
        }
    }

    @objc func presentLimitedLibraryPicker(_ call: CAPPluginCall) {
        guard currentStatus() == .limited else {
            call.resolve(["presented": false, "reason": "library_is_not_in_limited_mode"])
            return
        }
        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController else {
                call.reject("No view controller available to present the picker.")
                return
            }
            PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: viewController) { newlySelected in
                call.resolve(["presented": true, "newlySelectedCount": newlySelected.count])
            }
        }
    }

    @objc func getPhotoLibrarySummary(_ call: CAPPluginCall) {
        let status = currentStatus()
        guard PhotoLibraryScanner.canRead(status) else {
            rejectDenied(call, status)
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let summary = PhotoLibraryScanner.summary()
            call.resolve([
                "permissionStatus": PhotoLibraryScanner.permissionName(status),
                "platform": "ios",
                "photoCount": summary.photoCount,
                "videoCount": summary.videoCount,
                "totalAssets": summary.photoCount + summary.videoCount,
                "durationMs": summary.durationMs
            ])
        }
    }

    @objc func scanPhotoMetadata(_ call: CAPPluginCall) {
        let status = currentStatus()
        guard PhotoLibraryScanner.canRead(status) else {
            rejectDenied(call, status)
            return
        }

        var request = PhotoLibraryScanner.ScanRequest()
        request.limit = min(max(call.getInt("limit") ?? 100, 0), Self.maxLimit)
        request.offset = max(call.getInt("offset") ?? 0, 0)
        request.newestFirst = call.getBool("newestFirst") ?? true
        request.includeVideos = call.getBool("includeVideos") ?? false
        request.includeCloudShared = call.getBool("includeCloudShared") ?? false

        DispatchQueue.global(qos: .userInitiated).async {
            let output = PhotoLibraryScanner.scan(request)

            var notes: [String] = []
            if status == .limited {
                notes.append("Acesso limitado: só as fotos escolhidas pelo usuário são visíveis.")
            }

            let diagnostics: [String: Any] = [
                "permissionStatus": PhotoLibraryScanner.permissionName(status),
                "platform": "ios",
                "totalAssets": output.totalAssets,
                "scannedAssets": output.scannedAssets,
                "returnedAssets": output.assets.count,
                "scanDurationMs": output.scanDurationMs,
                "locationCheckedAssets": output.scannedAssets,
                "assetsWithLocation": output.withLocation,
                "assetsWithoutLocation": output.withoutLocation,
                "assetsWithDate": output.withDate,
                "assetsWithoutDate": output.withoutDate,
                "bySourceType": output.bySourceType,
                "notes": notes
            ]
            call.resolve([
                "assets": output.assets,
                "diagnostics": diagnostics
            ])
        }
    }

    /// Small pictures for the selection grid, only for the ids asked for.
    @objc func getThumbnails(_ call: CAPPluginCall) {
        let status = currentStatus()
        guard PhotoLibraryScanner.canRead(status) else {
            rejectDenied(call, status)
            return
        }
        let identifiers = Array((call.getArray("localIdentifiers", String.self) ?? []).prefix(Self.maxThumbnailBatch))
        let size = min(max(call.getInt("size") ?? 240, 32), Self.maxThumbnailSize)

        DispatchQueue.global(qos: .userInitiated).async {
            let assets = PhotoLibraryScanner.assetsByIdentifier(identifiers)
            let group = DispatchGroup()
            let lock = NSLock()
            var byId: [String: String] = [:]

            for identifier in identifiers {
                guard let asset = assets[identifier] else { continue }
                group.enter()
                PhotoLibraryScanner.thumbnailBase64(for: asset, size: size) { base64 in
                    if let base64 = base64 {
                        lock.lock()
                        byId[identifier] = base64
                        lock.unlock()
                    }
                    group.leave()
                }
            }
            group.wait()

            let thumbnails: [[String: Any]] = identifiers.map { identifier in
                var item: [String: Any] = ["localIdentifier": identifier]
                item["data"] = byId[identifier] ?? NSNull()
                return item
            }
            call.resolve(["thumbnails": thumbnails])
        }
    }

    /// One photo, reduced, with EXIF/GPS, for the normal upload pipeline.
    @objc func exportPhoto(_ call: CAPPluginCall) {
        let status = currentStatus()
        guard PhotoLibraryScanner.canRead(status) else {
            rejectDenied(call, status)
            return
        }
        guard let identifier = call.getString("localIdentifier") else {
            call.reject("localIdentifier is required.", "INVALID_ARGUMENT")
            return
        }
        let maxDimension = min(max(call.getInt("maxDimension") ?? 1600, 256), 4096)
        let quality = min(max(call.getDouble("quality") ?? 0.85, 0.3), 1.0)

        DispatchQueue.global(qos: .userInitiated).async {
            guard let asset = PhotoLibraryScanner.assetsByIdentifier([identifier])[identifier] else {
                call.reject("Photo not found in the library.", "ASSET_NOT_FOUND")
                return
            }
            do {
                let exported = try PhotoLibraryScanner.exportJPEG(
                    asset: asset, maxDimension: maxDimension, quality: quality
                )
                call.resolve([
                    "localIdentifier": identifier,
                    "data": exported.base64,
                    "mimeType": "image/jpeg",
                    "width": exported.width,
                    "height": exported.height,
                    "bytes": exported.bytes
                ])
            } catch PhotoLibraryScanner.ExportError.unavailable(let reason) {
                call.reject(reason, "ASSET_UNAVAILABLE")
            } catch {
                call.reject("Could not prepare this photo.", "EXPORT_FAILED")
            }
        }
    }

    /// For the "access denied" screen: jumps to this app's page in Settings.
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Settings are not available.")
                return
            }
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }
}

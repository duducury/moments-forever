import Foundation
import Photos
import PhotosUI
import UIKit
import ImageIO
import UniformTypeIdentifiers

/// Receives the result of the system photo picker (PHPickerViewController).
/// The picker runs out-of-process: choosing photos needs NO photo-library permission.
///
/// Closing the picker by swiping the sheet down does NOT call `didFinishPicking`, so the
/// presentation-controller callback reports that case too — otherwise the web side would
/// wait forever. `finish` runs at most once, whichever callback arrives first.
final class PhotoPickerSession: NSObject, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    private var completion: (([PHPickerResult]) -> Void)?

    init(completion: @escaping ([PHPickerResult]) -> Void) {
        self.completion = completion
    }

    private func finish(_ results: [PHPickerResult]) {
        guard let completion = completion else { return }
        self.completion = nil
        completion(results)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        finish(results) // empty when the person pressed Cancel
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finish([]) // swiped down: nothing was chosen
    }
}

/// Holds the photos the person picked, already reduced to JPEG files in the temp
/// folder, until the web side reads them one by one — so a hundred photos never
/// cross the bridge in a single message.
enum PhotoPickerStore {
    private static let lock = NSLock()
    private static var files: [String: URL] = [:]
    /// What the person chose, waiting for `prepare` (heavy) to be asked for.
    private static var pending: [PHPickerResult] = []

    static func setPending(_ results: [PHPickerResult]) {
        lock.lock()
        pending = results
        lock.unlock()
    }

    static func takePending() -> [PHPickerResult] {
        lock.lock()
        defer { lock.unlock() }
        let results = pending
        pending = []
        return results
    }

    private static var directory: URL {
        return FileManager.default.temporaryDirectory
            .appendingPathComponent("moments-picked", isDirectory: true)
    }

    /// Reduces every picked photo (≤ 1600 px JPEG, EXIF/GPS kept) into the temp folder.
    /// Blocking: call off the main thread. Photos that cannot be read are skipped.
    static func prepare(_ results: [PHPickerResult]) -> [[String: Any]] {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var items: [[String: Any]] = []

        for result in results {
            let provider = result.itemProvider
            guard provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) else { continue }

            let semaphore = DispatchSemaphore(value: 0)
            var produced: [String: Any]?
            let target = directory

            // iCloud originals are downloaded by the system here, which can take a while.
            provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, _ in
                defer { semaphore.signal() }
                // The URL is only valid inside this handler, so the work happens here.
                guard let url = url,
                      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                      let reduced = try? PhotoLibraryScanner.reduceToJPEG(
                        source: source, maxDimension: 1600, quality: 0.85
                      ) else { return }
                let token = UUID().uuidString
                let destination = target.appendingPathComponent("\(token).jpg")
                guard (try? reduced.data.write(to: destination)) != nil else { return }

                lock.lock()
                files[token] = destination
                lock.unlock()

                var item: [String: Any] = [
                    "token": token,
                    "width": reduced.width,
                    "height": reduced.height,
                    "bytes": reduced.data.count
                ]
                item["assetIdentifier"] = result.assetIdentifier ?? NSNull()
                item["name"] = provider.suggestedName ?? NSNull()
                produced = item
            }
            _ = semaphore.wait(timeout: .now() + 180)
            if let item = produced { items.append(item) }
        }
        return items
    }

    /// Hands out (and forgets) the file of one picked photo.
    static func take(_ token: String) -> URL? {
        lock.lock()
        defer { lock.unlock() }
        return files.removeValue(forKey: token)
    }

    /// Deletes whatever the web side did not read (cancelled import, error…).
    static func discardAll() {
        lock.lock()
        let leftovers = Array(files.values)
        files.removeAll()
        pending = []
        lock.unlock()
        for url in leftovers { try? FileManager.default.removeItem(at: url) }
    }
}

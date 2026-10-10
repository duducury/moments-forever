#!/usr/bin/env node
/**
 * Root-cause fixes for two @capacitor/cli 8.5.2 bugs that both stem from
 * @exxili/capacitor-nfc not being an npm/SPM package @capacitor/cli's
 * generation code expects: it silently drops the plugin from iOS sync, and
 * once discovered, it generates an SPM Package.swift that Xcode can't
 * resolve. Runs as a `postinstall` script so both patches are reapplied
 * after every `npm install`, on any machine.
 *
 * --- Fix 1: "NFC plugin is not implemented on iOS" -----------------------
 *
 * @capacitor/cli discovers Capacitor plugins by reading each dependency's
 * package.json — specifically `resolveNode()` in
 * @capacitor/cli/dist/util/node.js first tries
 * `require.resolve("<name>/package.json", { paths: [rootDir] })`, falling
 * back to a plain `fs.existsSync(rootDir + "/node_modules/<name>/package.json")`
 * check only if that throws.
 *
 * @exxili/capacitor-nfc ships an `exports` map with only `"."` — Node
 * refuses to resolve `./package.json` for a package whose `exports` field
 * doesn't explicitly allow it, so the first attempt always throws. In this
 * npm-workspaces monorepo, the package hoists to the repo root's
 * node_modules (not apps/web/node_modules), so the literal fallback path
 * never exists either. Both resolution attempts fail, `resolvePlugin()`
 * swallows the error and returns null, and the plugin is silently dropped
 * from every list @capacitor/cli builds from it — with no warning printed.
 * That's why `npx cap sync ios` never added the plugin to
 * `ios/App/App/capacitor.config.json`'s `packageClassList` (the array
 * Capacitor's native runtime reads via NSClassFromString to actually
 * register a plugin — see CapacitorBridge.swift `registerPlugins()`), and
 * why `ios/App/CapApp-SPM/Package.swift` never got the plugin listed as an
 * SPM dependency either (same resolution call, same failure).
 *
 * Fix: patch the installed copy to also expose `./package.json`, which is
 * what most well-behaved npm packages do — restoring normal resolution
 * with no further workarounds needed.
 *
 * --- Fix 2: Xcode can't resolve product 'ExxiliCapacitorNfc' -------------
 *
 * Once discovered, @capacitor/cli's SPM generator
 * (@capacitor/cli/dist/util/spm.js `generatePackageText()`) writes, for
 * every plugin:
 *   .package(name: "<X>", path: "...")
 *   .product(name: "<X>", package: "<X>")
 * where <X> is always `plugin.ios.name`, which
 * (@capacitor/cli/dist/ios/common.js `resolvePlugin()`) is always set to
 * `plugin.name`, which (@capacitor/cli/dist/plugin.js `resolvePlugin()`) is
 * always `fixName(pluginId)` — a deterministic PascalCase transform of the
 * npm dependency's name string, with NO way to override it per-plugin.
 * `fixName("@exxili/capacitor-nfc")` is "ExxiliCapacitorNfc".
 *
 * The CLI therefore always writes the SAME string on the local package
 * alias and on the `.product(name:)` reference — it can never emit two
 * different names there. For Xcode/SwiftPM to resolve that product
 * reference, @exxili/capacitor-nfc's own Package.swift must declare a
 * product with that exact name. It doesn't: it declares
 * `.library(name: "CapacitorNfc", ...)`, so Xcode fails with
 * "product 'ExxiliCapacitorNfc' ... not found in package 'ExxiliCapacitorNfc'".
 *
 * Fix: patch the installed plugin's own Package.swift so its declared
 * package/product name matches what @capacitor/cli will always generate
 * ("ExxiliCapacitorNfc"), computed here with the exact same `fixName()`
 * algorithm @capacitor/cli uses, rather than hardcoding the string. This
 * makes `npx cap sync ios` regenerate a self-consistent, buildable
 * CapApp-SPM/Package.swift every time — CapApp-SPM/Package.swift itself is
 * never hand-edited.
 *
 * --- Fix 3: NFCWriter.swift needs NDEF over NFCTagReaderSession, not
 *            NFCNDEFReaderSession --------------------------------------
 *
 * App Store Connect now rejects an upload whose
 * `com.apple.developer.nfc.readersession.formats` entitlement (see
 * ios/App/App/App.entitlements) lists `NDEF` at all, and requires `TAG`
 * instead — the value Apple currently documents as the one that grants read
 * *and write* access via `NFCTagReaderSession`. `NDEF` is what
 * `NFCNDEFReaderSession` needs; with only `TAG` in the entitlement, any
 * `NFCNDEFReaderSession` the plugin opens fails at runtime with a missing-
 * entitlement error.
 *
 * The plugin's NFCReader.swift already reads NDEF over an
 * `NFCTagReaderSession` by default (its `.fullTag` mode extracts the
 * concrete tag — ISO7816/MiFare/FeliCa/ISO15693 — from the `NFCTag` enum and
 * calls `.queryNDEFStatus`/`.readNDEF` on it, all of which conform to
 * `NFCNDEFTag`), so reading needs no patch once native-nfc.ts stops forcing
 * "ndef" mode (see readNfcTag()). NFCWriter.swift has no equivalent: it only
 * ever opens an `NFCNDEFReaderSession`. This fix replaces it with a
 * TAG-session implementation that mirrors NFCReader.swift's own approach —
 * NDEF write functionality is fully preserved, just moved onto the session
 * type the new entitlement actually grants.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const pluginDirs = [
  join(here, "..", "..", "..", "node_modules", "@exxili", "capacitor-nfc"),
  join(here, "..", "node_modules", "@exxili", "capacitor-nfc"),
];

const pluginDir = pluginDirs.find((dir) => existsSync(join(dir, "package.json")));

if (!pluginDir) {
  console.warn(
    "[fix-capacitor-nfc-plugin] @exxili/capacitor-nfc not installed — skipping.",
  );
  process.exit(0);
}

// Same transform as @capacitor/cli's plugin.js `fixName()`, so the target
// name here always tracks whatever the CLI would actually generate.
function fixName(name) {
  name = name
    .replace(/\//g, "_")
    .replace(/-/g, "_")
    .replace(/@/g, "")
    .replace(/_\w/g, (m) => m[1].toUpperCase());
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const pluginId = "@exxili/capacitor-nfc";
const spmName = fixName(pluginId);

// Fix 1: expose ./package.json so @capacitor/cli's require.resolve succeeds.
const pkgPath = join(pluginDir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

if (pkg.exports && !pkg.exports["./package.json"]) {
  pkg.exports["./package.json"] = "./package.json";
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`[fix-capacitor-nfc-plugin] Patched ${pkgPath} to expose ./package.json`);
} else {
  console.log(
    `[fix-capacitor-nfc-plugin] ${pkgPath} already exposes ./package.json — nothing to do.`,
  );
}

// Fix 2: rename the plugin's own SPM package/product to match what
// @capacitor/cli's generator will always reference.
const swiftPath = join(pluginDir, "Package.swift");
if (existsSync(swiftPath)) {
  const original = readFileSync(swiftPath, "utf-8");
  // The plugin tracks `branch: "main"` of capacitor-swift-pm, a moving target that also
  // clashes with CapApp-SPM's `exact: "8.5.2"` for the same package (and Xcode Cloud needs a
  // reproducible Package.resolved). Use the same versioned rule as the other local plugins;
  // the plugin only uses the Capacitor and Cordova products, present in every 8.x release.
  const patched = original
    .replace(/name:\s*"CapacitorNfc"/g, `name: "${spmName}"`)
    .replace(/(capacitor-swift-pm\.git",\s*)branch:\s*"main"/, '$1from: "8.0.0"');
  if (patched !== original) {
    writeFileSync(swiftPath, patched);
    console.log(
      `[fix-capacitor-nfc-plugin] Patched ${swiftPath}: package/product name -> "${spmName}", capacitor-swift-pm -> from 8.0.0`,
    );
  } else if (original.includes(`name: "${spmName}"`) && !/branch:\s*"main"/.test(original)) {
    console.log(`[fix-capacitor-nfc-plugin] ${swiftPath} already patched — nothing to do.`);
  } else {
    console.warn(
      `[fix-capacitor-nfc-plugin] ${swiftPath} didn't match the expected "CapacitorNfc" name — check manually.`,
    );
  }
} else {
  console.warn(`[fix-capacitor-nfc-plugin] ${swiftPath} not found — skipping SPM name fix.`);
}

// Fix 3: rewrite NFCWriter.swift to write NDEF over NFCTagReaderSession
// (needs the "TAG" entitlement) instead of NFCNDEFReaderSession (needs
// "NDEF", which Apple's upload validation now rejects).
const writerPath = join(pluginDir, "ios", "Sources", "NFCPlugin", "NFCWriter.swift");
const patchedWriterSource = `import Foundation
import CoreNFC

// Patched by fix-capacitor-nfc-plugin.mjs (Fix 3): writes NDEF over
// NFCTagReaderSession instead of NFCNDEFReaderSession, so it works with an
// entitlement that only lists "TAG" (no "NDEF") — see that script for why.
@objc public class NFCWriter: NSObject, NFCTagReaderSessionDelegate {
    private var writerSession: NFCTagReaderSession?
    private var messageToWrite: NFCNDEFMessage?

    public var onWriteSuccess: (() -> Void)?
    public var onError: ((Error) -> Void)?

    public func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {
        // Intentionally left blank; no special handling needed when the session becomes active.
    }

    @objc public func startWriting(message: NFCNDEFMessage) {
        print("NFCWriter startWriting called")
        self.messageToWrite = message

        guard NFCTagReaderSession.readingAvailable else {
            print("NFC writing not supported on this device")
            return
        }
        // No .iso18092 (FeliCa) on purpose: polling for it requires the Info.plist
        // key com.apple.developer.nfc.readersession.felica.systemcodes, and
        // without it iOS ends the session with "Missing required entitlement".
        // NDEF tags (NTAG/MIFARE = .iso14443, Type 5 = .iso15693) need no extra keys.
        guard let session = NFCTagReaderSession(
            pollingOption: [.iso14443, .iso15693],
            delegate: self,
            queue: nil
        ) else {
            print("[NFC] Failed to create NFCTagReaderSession for writing (nil).")
            return
        }
        session.alertMessage = "Hold your iPhone near the NFC tag to write."
        writerSession = session
        session.begin()
    }

    public func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        print("NFC writer session error: \\(error.localizedDescription)")
        writerSession = nil
        if let nfcError = error as? NFCReaderError,
           nfcError.code == .readerSessionInvalidationErrorUserCanceled {
            return
        }
        onError?(error)
    }

    public func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        if tags.count > 1 {
            let retryInterval = DispatchTimeInterval.milliseconds(500)
            session.alertMessage = "More than one tag detected. Please try again."
            DispatchQueue.global().asyncAfter(deadline: .now() + retryInterval) {
                session.restartPolling()
            }
            return
        }
        guard let tag = tags.first else {
            session.invalidate(errorMessage: "No tag found.")
            return
        }

        session.connect(to: tag) { (error: Error?) in
            if let error = error {
                session.invalidate(errorMessage: "Unable to connect to tag.")
                self.onError?(error)
                return
            }

            guard let ndefTag = Self.ndefTag(from: tag) else {
                session.invalidate(errorMessage: "Tag is not NDEF compliant.")
                return
            }

            ndefTag.queryNDEFStatus { (ndefStatus: NFCNDEFStatus, _: Int, error: Error?) in
                if let error = error {
                    session.invalidate(errorMessage: "Unable to query the NDEF status of tag.")
                    self.onError?(error)
                    return
                }

                switch ndefStatus {
                case .notSupported:
                    session.invalidate(errorMessage: "Tag is not NDEF compliant.")
                case .readOnly:
                    session.invalidate(errorMessage: "Tag is read-only.")
                case .readWrite:
                    guard let message = self.messageToWrite else {
                        session.invalidate(errorMessage: "No message to write.")
                        return
                    }
                    ndefTag.writeNDEF(message) { (error: Error?) in
                        if let error = error {
                            session.invalidate(errorMessage: "Failed to write NDEF message.")
                            self.onError?(error)
                            return
                        }
                        session.alertMessage = "NDEF message written successfully."
                        session.invalidate()
                        self.onWriteSuccess?()
                    }
                @unknown default:
                    session.invalidate(errorMessage: "Unknown NDEF tag status.")
                }
            }
        }
    }

    /// Extracts the concrete NFCNDEFTag-conforming object out of the NFCTag
    /// enum NFCTagReaderSession hands back — the enum itself doesn't conform
    /// to NFCNDEFTag, only its associated concrete tag types do. Mirrors
    /// NFCReader.swift's own per-technology handling in this same plugin.
    private static func ndefTag(from tag: NFCTag) -> NFCNDEFTag? {
        switch tag {
        case .iso7816(let concrete): return concrete
        case .miFare(let concrete): return concrete
        case .feliCa(let concrete): return concrete
        case .iso15693(let concrete): return concrete
        @unknown default: return nil
        }
    }
}
`;

if (existsSync(writerPath)) {
  const currentWriterSource = readFileSync(writerPath, "utf-8");
  // Compare the whole file (not just "is it TAG-based"), so an install that was
  // patched by an older version of this script — e.g. one that still polled
  // FeliCa — gets updated too.
  if (currentWriterSource === patchedWriterSource) {
    console.log(`[fix-capacitor-nfc-plugin] ${writerPath} already patched — nothing to do.`);
  } else {
    writeFileSync(writerPath, patchedWriterSource);
    console.log(
      `[fix-capacitor-nfc-plugin] Patched ${writerPath}: writes NDEF over NFCTagReaderSession (TAG entitlement) instead of NFCNDEFReaderSession (NDEF entitlement).`,
    );
  }
} else {
  console.warn(`[fix-capacitor-nfc-plugin] ${writerPath} not found — skipping NFCWriter fix.`);
}

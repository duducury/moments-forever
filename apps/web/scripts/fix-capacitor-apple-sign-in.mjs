#!/usr/bin/env node
/**
 * @capacitor-community/apple-sign-in 7.1.0 (the latest release) is built for
 * Capacitor 7: its own Package.swift depends on
 *   .package(url: ".../capacitor-swift-pm.git", from: "7.0.0")
 * and SwiftPM's `from:` means "up to the next major" (>= 7.0.0, < 8.0.0).
 * This app pins capacitor-swift-pm to exactly 8.5.2 (ios/App/CapApp-SPM), so
 * Xcode could never resolve both and the build would fail with an
 * unsatisfiable-dependency error.
 *
 * The plugin's Swift code only uses AuthenticationServices and the stable
 * CAPPlugin/CAPPluginCall API, so widening its constraint to 8.x is enough.
 * Runs from `postinstall` (and from ios/App/ci_scripts/ci_post_clone.sh) and
 * is idempotent. It never touches @exxili/capacitor-nfc — that plugin has its
 * own script (fix-capacitor-nfc-plugin.mjs).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TAG = "[fix-capacitor-apple-sign-in]";
const here = dirname(fileURLToPath(import.meta.url));

const pluginDirs = [
  join(here, "..", "..", "..", "node_modules", "@capacitor-community", "apple-sign-in"),
  join(here, "..", "node_modules", "@capacitor-community", "apple-sign-in"),
];

const pluginDir = pluginDirs.find((dir) => existsSync(join(dir, "package.json")));

if (!pluginDir) {
  console.warn(`${TAG} @capacitor-community/apple-sign-in not installed — skipping.`);
  process.exit(0);
}

const swiftPath = join(pluginDir, "Package.swift");
if (!existsSync(swiftPath)) {
  console.warn(`${TAG} ${swiftPath} not found — skipping.`);
  process.exit(0);
}

const original = readFileSync(swiftPath, "utf-8");
const OLD = /(capacitor-swift-pm\.git",\s*)from:\s*"7\.0\.0"/;

if (OLD.test(original)) {
  writeFileSync(swiftPath, original.replace(OLD, '$1from: "8.0.0"'));
  console.log(`${TAG} Patched ${swiftPath}: capacitor-swift-pm from "7.0.0" -> "8.0.0"`);
} else if (/capacitor-swift-pm\.git",\s*from:\s*"8\.0\.0"/.test(original)) {
  console.log(`${TAG} ${swiftPath} already patched — nothing to do.`);
} else {
  console.warn(
    `${TAG} ${swiftPath} didn't match the expected capacitor-swift-pm constraint — check manually.`,
  );
}

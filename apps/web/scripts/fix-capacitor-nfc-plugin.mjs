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
  const patched = original.replace(/name:\s*"CapacitorNfc"/g, `name: "${spmName}"`);
  if (patched !== original) {
    writeFileSync(swiftPath, patched);
    console.log(
      `[fix-capacitor-nfc-plugin] Patched ${swiftPath}: package/product name -> "${spmName}"`,
    );
  } else if (original.includes(`name: "${spmName}"`)) {
    console.log(`[fix-capacitor-nfc-plugin] ${swiftPath} already patched — nothing to do.`);
  } else {
    console.warn(
      `[fix-capacitor-nfc-plugin] ${swiftPath} didn't match the expected "CapacitorNfc" name — check manually.`,
    );
  }
} else {
  console.warn(`[fix-capacitor-nfc-plugin] ${swiftPath} not found — skipping SPM name fix.`);
}

#!/usr/bin/env node
/**
 * Root-cause fix for "NFC plugin is not implemented on iOS".
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
 * This script patches the installed copy to also expose `./package.json`,
 * which is what most well-behaved npm packages do — restoring normal
 * resolution with no further workarounds needed. Runs as a `postinstall`
 * script so it's reapplied after every `npm install`, on any machine.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const candidates = [
  join(here, "..", "..", "..", "node_modules", "@exxili", "capacitor-nfc", "package.json"),
  join(here, "..", "node_modules", "@exxili", "capacitor-nfc", "package.json"),
];

const pkgPath = candidates.find((candidate) => existsSync(candidate));

if (!pkgPath) {
  console.warn(
    "[fix-capacitor-nfc-plugin-exports] @exxili/capacitor-nfc not installed — skipping.",
  );
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

if (pkg.exports && !pkg.exports["./package.json"]) {
  pkg.exports["./package.json"] = "./package.json";
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(
    `[fix-capacitor-nfc-plugin-exports] Patched ${pkgPath} to expose ./package.json`,
  );
} else {
  console.log(
    "[fix-capacitor-nfc-plugin-exports] Already patched (or no exports field) — nothing to do.",
  );
}

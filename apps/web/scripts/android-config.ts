/**
 * Reads back the server address the Android app will load, because `cap sync` can fail while Gradle still
 * says BUILD SUCCESSFUL (the previous, wrong file stays in place).
 *
 * Usage (from apps/web):
 *   npm run android:check-config                 check android/app/src/main/assets/capacitor.config.json
 *   npm run android:check-apk [-- path/to.apk]    check the file INSIDE the built APK (default: the debug APK)
 *
 * With CAPACITOR_SERVER_URL set, the file must match it exactly; without it any valid https address is
 * accepted and a non-production one is flagged so it is never mistaken for a store build.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { checkGeneratedConfig } from "../src/lib/capacitor/check-config";
import { resolveServerUrl } from "../src/lib/capacitor/server-url";

const ANDROID = path.resolve(__dirname, "../android");
const GENERATED = path.join(ANDROID, "app/src/main/assets/capacitor.config.json");
const DEFAULT_APK = path.join(ANDROID, "app/build/outputs/apk/debug/app-debug.apk");

function fail(lines: readonly string[]): never {
  console.error("Android server URL check FAILED:");
  lines.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
}

function expected(): string | undefined {
  const env = process.env.CAPACITOR_SERVER_URL;
  if (env === undefined || env.trim() === "") return undefined;
  try {
    return resolveServerUrl(env);
  } catch (error) {
    return fail([(error as Error).message]);
  }
}

function report(label: string, text: string, expectedUrl: string | undefined): string {
  const result = checkGeneratedConfig(text, expectedUrl);
  if (result.problems.length > 0) fail([`${label}:`, ...result.problems]);
  console.log(`OK: ${label} -> the app will load ${result.url}`);
  if (!result.isProduction) {
    console.log("NOTE: this is NOT the production site. Fine for testing; a store build must run `npm run cap:sync:android` without CAPACITOR_SERVER_URL.");
  }
  return result.url!;
}

const [command, apkArg] = process.argv.slice(2);
const expectedUrl = expected();

if (command === "check") {
  if (!existsSync(GENERATED)) fail([`${GENERATED} does not exist. Run \`npm run cap:sync:android\` first.`]);
  report("generated capacitor.config.json", readFileSync(GENERATED, "utf8"), expectedUrl);
} else if (command === "apk") {
  const apk = path.resolve(apkArg ?? DEFAULT_APK);
  if (!existsSync(apk)) fail([`${apk} does not exist. Build it first (./gradlew assembleDebug).`]);
  let inside: string;
  try {
    inside = execFileSync("unzip", ["-p", apk, "assets/capacitor.config.json"], { encoding: "utf8" });
  } catch {
    fail(["could not read assets/capacitor.config.json from the APK (is `unzip` installed, and is this an Android APK?)"]);
  }
  const apkUrl = report(`config inside ${path.basename(apk)}`, inside, expectedUrl);
  if (existsSync(GENERATED)) {
    const generated = checkGeneratedConfig(readFileSync(GENERATED, "utf8")).url;
    if (generated !== apkUrl) {
      fail([`the APK loads ${apkUrl} but the last sync wrote ${generated}: rebuild the APK (./gradlew assembleDebug) after syncing.`]);
    }
  }
} else {
  console.error("Usage: android-config.ts check | apk [path]");
  process.exit(1);
}

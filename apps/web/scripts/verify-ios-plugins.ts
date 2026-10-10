/**
 * Fails (exit 1) unless the MomentsNativeAuth iOS plugin is registered and linked.
 * Rules and when to run it: docs/releasing.md.
 *
 * Usage (from apps/web):
 *   npm run ios:verify-plugins                       check the files `cap sync ios` generated
 *   npm run ios:verify-plugins -- --app path/App.app  also check a BUILT app (config inside it + the executable)
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  NATIVE_AUTH_PLUGIN,
  checkBinaryContainsPlugin,
  checkRegisteredInConfig,
  verifyNativeAuthPlugin,
} from "../src/lib/ios/native-plugins";

const WEB = path.resolve(__dirname, "..");
const REPO = path.resolve(WEB, "../..");
const CONFIG = path.join(WEB, "ios/App/App/capacitor.config.json");
const SPM = path.join(WEB, "ios/App/CapApp-SPM/Package.swift");
const SOURCE = path.join(REPO, NATIVE_AUTH_PLUGIN.sourcePath);

function read(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

const errors: string[] = [];
const configJson = read(CONFIG);
const packageSwift = read(SPM);
const pluginSource = read(SOURCE);
if (configJson === null) errors.push(`${CONFIG} does not exist. Run \`npm run cap:sync\` in apps/web.`);
if (packageSwift === null) errors.push(`${SPM} does not exist. Run \`npm run cap:sync\` in apps/web.`);
if (pluginSource === null) errors.push(`${SOURCE} does not exist.`);
if (configJson !== null && packageSwift !== null && pluginSource !== null) {
  errors.push(...verifyNativeAuthPlugin({ configJson, packageSwift, pluginSource }));
}

const appFlag = process.argv.indexOf("--app");
if (appFlag !== -1) {
  const appDir = process.argv[appFlag + 1];
  if (!appDir) {
    errors.push("--app needs the path to a built App.app (e.g. …/Products/Applications/App.app).");
  } else {
    const builtConfig = read(path.join(appDir, "capacitor.config.json"));
    const executable = path.join(appDir, "App");
    if (builtConfig === null) errors.push(`${appDir}/capacitor.config.json not found: not a built App.app?`);
    else errors.push(...checkRegisteredInConfig(builtConfig).map((e) => `[built app] ${e}`));
    if (!existsSync(executable)) errors.push(`${executable} not found: not a built App.app?`);
    else errors.push(...checkBinaryContainsPlugin(readFileSync(executable)).map((e) => `[built app] ${e}`));
  }
}

if (errors.length > 0) {
  console.error("iOS plugin check FAILED:");
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}
console.log(
  `OK: ${NATIVE_AUTH_PLUGIN.nativeClass} is registered in capacitor.config.json, linked in CapApp-SPM/Package.swift` +
    `${appFlag !== -1 ? " and present in the built app" : ""}.`,
);

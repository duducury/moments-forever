import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  NATIVE_AUTH_PLUGIN,
  checkBinaryContainsPlugin,
  checkLinkedInSpmManifest,
  checkPluginSource,
  checkRegisteredInConfig,
  verifyNativeAuthPlugin,
} from "./native-plugins";

const WEB = path.resolve(__dirname, "../../..");
const REPO = path.resolve(WEB, "../..");
const CONFIG = path.join(WEB, "ios/App/App/capacitor.config.json");
const SPM = path.join(WEB, "ios/App/CapApp-SPM/Package.swift");
const SOURCE = path.join(REPO, NATIVE_AUTH_PLUGIN.sourcePath);

const config = (list: string[]) => JSON.stringify({ appId: "x", packageClassList: list });

test("config check passes when the class is registered and fails clearly when it is not", () => {
  assert.deepEqual(checkRegisteredInConfig(config(["NFCPlugin", "MomentsNativeAuthPlugin"])), []);
  const missing = checkRegisteredInConfig(config(["SignInWithApple", "NFCPlugin", "MomentsPhotoLibraryPlugin"]));
  assert.equal(missing.length, 1);
  assert.match(missing[0]!, /MomentsNativeAuthPlugin is missing from packageClassList/);
  assert.match(missing[0]!, /cap:sync/);
});

test("config check fails on invalid JSON or a missing packageClassList", () => {
  assert.equal(checkRegisteredInConfig("not json").length, 1);
  assert.equal(checkRegisteredInConfig(JSON.stringify({ appId: "x" })).length, 1);
});

test("SPM check needs both the package dependency and the linked product", () => {
  const ok = `.package(name: "MomentsForeverCapacitorNativeAuth", path: "x")\n.product(name: "MomentsForeverCapacitorNativeAuth", package: "MomentsForeverCapacitorNativeAuth")`;
  assert.deepEqual(checkLinkedInSpmManifest(ok), []);
  assert.equal(checkLinkedInSpmManifest(".package(name: \"MomentsForeverCapacitorNativeAuth\", path: \"x\")").length, 1);
  assert.equal(checkLinkedInSpmManifest("// nothing").length, 2);
});

test("source check: @objc class name and jsName must match what is registered", () => {
  assert.deepEqual(checkPluginSource('@objc(MomentsNativeAuthPlugin)\nlet jsName = "MomentsNativeAuth"'), []);
  assert.equal(checkPluginSource('@objc(Other)\nlet jsName = "MomentsNativeAuth"').length, 1);
  assert.equal(checkPluginSource('@objc(MomentsNativeAuthPlugin)\nlet jsName = "Other"').length, 1);
});

test("a cancelled session's late completion cannot release the session that replaced it", () => {
  const source = readFileSync(SOURCE, "utf8");
  assert.match(source, /generation \+= 1/);
  assert.match(source, /plugin\.generation == generation/);
  assert.doesNotMatch(source, /self\?\.session = nil/);
});

test("binary check looks for the class name in the executable", () => {
  assert.deepEqual(checkBinaryContainsPlugin(Buffer.from("xx_MomentsNativeAuthPlugin_yy")), []);
  assert.equal(checkBinaryContainsPlugin(Buffer.from("only NFCPlugin here")).length, 1);
});

test("the web code registers the same JS name the native plugin and the check use", () => {
  const web = readFileSync(path.join(REPO, "packages/capacitor-native-auth/src/index.ts"), "utf8");
  assert.match(web, new RegExp(`registerPlugin<[^>]*>\\(\\s*"${NATIVE_AUTH_PLUGIN.jsName}"`));
  assert.match(readFileSync(path.join(WEB, "src/lib/auth/native-oauth.ts"), "utf8"), new RegExp(`PLUGIN_NAME = "${NATIVE_AUTH_PLUGIN.jsName}"`));
});

test("the committed plugin source satisfies the source check", () => {
  assert.deepEqual(checkPluginSource(readFileSync(SOURCE, "utf8")), []);
});

test("ci_post_clone.sh runs the plugin check after `cap sync ios`", () => {
  const script = readFileSync(path.join(WEB, "ios/App/ci_scripts/ci_post_clone.sh"), "utf8");
  const sync = script.indexOf("cap sync ios");
  const verify = script.indexOf("verify-ios-plugins");
  assert.ok(sync !== -1 && verify > sync, "verify-ios-plugins must run after cap sync ios");
  assert.ok(script.includes("MomentsNativeAuthPlugin"), "the script must name the plugin explicitly");
});

test("CLI: fails with a clear message when generated files lack the plugin, passes when complete", { skip: !hasGenerated() }, () => {
  const run = () =>
    spawnSync("node", ["--import", "tsx", "scripts/verify-ios-plugins.ts"], { cwd: WEB, encoding: "utf8" });
  const result = run();
  const generated = verifyNativeAuthPlugin({
    configJson: readFileSync(CONFIG, "utf8"),
    packageSwift: readFileSync(SPM, "utf8"),
    pluginSource: readFileSync(SOURCE, "utf8"),
  });
  if (generated.length === 0) {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^OK:/);
  } else {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /iOS plugin check FAILED/);
  }
});

function hasGenerated(): boolean {
  try {
    execFileSync("test", ["-f", CONFIG]);
    execFileSync("test", ["-f", SPM]);
    return true;
  } catch {
    return false;
  }
}

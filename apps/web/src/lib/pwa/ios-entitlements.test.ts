import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const IOS_APP = path.resolve(__dirname, "../../../ios/App");

/** Minimal reader for the flat `<key>…</key><array><string>…</string></array>` entitlements plist. */
function arrayEntitlement(plist: string, key: string): string[] | null {
  const match = plist.match(
    new RegExp(`<key>${key.replace(/\./g, "\\.")}</key>\\s*<array>([\\s\\S]*?)</array>`),
  );
  if (!match) return null;
  return [...match[1]!.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]!);
}

const entitlements = readFileSync(path.join(IOS_APP, "App/App.entitlements"), "utf8");

test("entitlements enable Sign in with Apple (App Review guideline 4.8)", () => {
  assert.deepEqual(arrayEntitlement(entitlements, "com.apple.developer.applesignin"), ["Default"]);
});

test("the NFC entitlement is still exactly TAG", () => {
  assert.deepEqual(arrayEntitlement(entitlements, "com.apple.developer.nfc.readersession.formats"), ["TAG"]);
});

test("entitlements declare the Universal Links domain (and only it)", () => {
  assert.deepEqual(arrayEntitlement(entitlements, "com.apple.developer.associated-domains"), [
    "applinks:momentsforever.vercel.app",
  ]);
});

test("the Swift package links both the Apple sign-in plugin and the NFC plugin", () => {
  const spm = readFileSync(path.join(IOS_APP, "CapApp-SPM/Package.swift"), "utf8");
  assert.match(spm, /\.product\(name: "CapacitorCommunityAppleSignIn", package: "CapacitorCommunityAppleSignIn"\)/);
  assert.match(spm, /\.product\(name: "ExxiliCapacitorNfc", package: "ExxiliCapacitorNfc"\)/);
  assert.match(spm, /\.product\(name: "MomentsForeverCapacitorNativeAuth", package: "MomentsForeverCapacitorNativeAuth"\)/);
});

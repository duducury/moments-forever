import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { GET as getAssetLinks } from "../../app/.well-known/assetlinks.json/route";
import { buildAasaComponents } from "../ios/universal-links";
import { ANDROID_PACKAGE_NAME, buildAssetLinks, parseCertFingerprints } from "./app-links";

const WEB = path.resolve(__dirname, "../../..");
const FP = Array.from({ length: 32 }, (_, i) => (i * 7 + 3).toString(16).padStart(2, "0").toUpperCase()).join(":");

test("without a configured certificate the assetlinks file is empty (nothing is invented)", () => {
  assert.deepEqual(buildAssetLinks(parseCertFingerprints(undefined)), []);
  assert.deepEqual(buildAssetLinks(parseCertFingerprints("")), []);
  assert.deepEqual(buildAssetLinks(parseCertFingerprints("not-a-fingerprint, 12:34")), []);
});

test("a real SHA-256 fingerprint is normalised; anything malformed is dropped", () => {
  const lower = FP.toLowerCase();
  const bare = FP.replace(/:/g, "");
  assert.deepEqual(parseCertFingerprints(lower), [FP]);
  assert.deepEqual(parseCertFingerprints(bare), [FP]);
  assert.deepEqual(parseCertFingerprints(`${FP}, ${lower}\n${bare}`), [FP], "duplicates collapse");
  assert.deepEqual(parseCertFingerprints(`${FP.slice(0, -1)}`), [], "too short");
  assert.deepEqual(parseCertFingerprints(`${FP.replace(/:/g, "-")}`), [], "wrong separator");
  assert.deepEqual(parseCertFingerprints(`ZZ${FP.slice(2)}`), [], "not hex");
});

test("the statement targets the Android package and lists every fingerprint", () => {
  const other = FP.replace(/^../, "FF");
  assert.deepEqual(buildAssetLinks([FP, other]), [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.momentsforever.app", sha256_cert_fingerprints: [FP, other] },
    },
  ]);
  assert.equal(ANDROID_PACKAGE_NAME, "com.momentsforever.app");
});

test("the Java allowlist and the manifest intent-filter keep the iOS shared-link patterns", () => {
  // The always-open rules are the AASA components before the first exclusion.
  const ios: string[] = [];
  for (const component of buildAasaComponents()) {
    if (component.exclude) break;
    ios.push(component["/"]);
  }
  assert.deepEqual(ios, ["/n/*", "/a/*", "/perfil", "/perfil/*/album/*"]);

  const java = readFileSync(path.join(WEB, "android/app/src/main/java/com/momentsforever/app/AppLinkRules.java"), "utf8");
  const block = java.split("BEGIN APP LINK PATTERNS")[1]!.split("END APP LINK PATTERNS")[0]!;
  const javaPatterns = [...block.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(javaPatterns, ios);

  const manifest = readFileSync(path.join(WEB, "android/app/src/main/AndroidManifest.xml"), "utf8");
  assert.match(manifest, /android:host="momentsforever\.vercel\.app"/);
  assert.match(manifest, /android:pathPrefix="\/n\/"/);
  assert.match(manifest, /android:pathPrefix="\/a\/"/);
  assert.match(manifest, /android:path="\/perfil"/);
  assert.match(manifest, /android:pathPattern="\/perfil\/\.\*\/album\/\.\*"/);
});

test("the manifest declares NFC as optional and no unneeded media permissions", () => {
  const manifest = readFileSync(path.join(WEB, "android/app/src/main/AndroidManifest.xml"), "utf8");
  assert.match(manifest, /<uses-permission android:name="android\.permission\.NFC"/);
  assert.match(manifest, /<uses-feature android:name="android\.hardware\.nfc" android:required="false"/);
  assert.doesNotMatch(manifest, /android\.permission\.CAMERA/);
  assert.doesNotMatch(manifest, /READ_MEDIA_VIDEO/);

  const photos = readFileSync(
    path.join(WEB, "../../packages/capacitor-photo-library/android/src/main/AndroidManifest.xml"),
    "utf8",
  );
  assert.doesNotMatch(photos, /<uses-permission[^>]*READ_MEDIA_VIDEO/);
  assert.match(photos, /READ_MEDIA_IMAGES/);
});

test("the OAuth callback intent-filter is exactly com.momentsforever.app://auth/callback", () => {
  const manifest = readFileSync(path.join(WEB, "android/app/src/main/AndroidManifest.xml"), "utf8");
  assert.match(
    manifest,
    /<data android:scheme="com\.momentsforever\.app" android:host="auth" android:path="\/callback" \/>/,
  );
});

test("the Android project keeps the production target level and backup is off", () => {
  const variables = readFileSync(path.join(WEB, "android/variables.gradle"), "utf8");
  const target = Number(/targetSdkVersion\s*=\s*(\d+)/.exec(variables)?.[1]);
  assert.ok(target >= 36, `targetSdkVersion ${target} is below Google Play's API 36 requirement`);
  const manifest = readFileSync(path.join(WEB, "android/app/src/main/AndroidManifest.xml"), "utf8");
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});

test("the route serves JSON, empty until the fingerprint env var is set", async () => {
  const previous = process.env.ANDROID_APP_SHA256_FINGERPRINTS;
  try {
    delete process.env.ANDROID_APP_SHA256_FINGERPRINTS;
    const empty = getAssetLinks();
    assert.equal(empty.headers.get("content-type"), "application/json");
    assert.deepEqual(await empty.json(), []);

    process.env.ANDROID_APP_SHA256_FINGERPRINTS = FP;
    const filled = (await getAssetLinks().json()) as Array<{ target: { sha256_cert_fingerprints: string[] } }>;
    assert.deepEqual(filled[0]!.target.sha256_cert_fingerprints, [FP]);
  } finally {
    if (previous === undefined) delete process.env.ANDROID_APP_SHA256_FINGERPRINTS;
    else process.env.ANDROID_APP_SHA256_FINGERPRINTS = previous;
  }
});

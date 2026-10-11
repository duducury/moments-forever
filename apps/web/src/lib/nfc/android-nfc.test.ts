import assert from "node:assert/strict";
import test from "node:test";

import { needsStartScan, nfcUnavailableMessage, nativePlatform } from "./android-nfc";

test("NFC off or missing gives a clear message; enabled (or unknown) lets the flow continue", () => {
  assert.equal(nfcUnavailableMessage("NOT_SUPPORTED"), "Este aparelho não tem NFC.");
  assert.match(nfcUnavailableMessage("DISABLED") ?? "", /desligado/);
  assert.equal(nfcUnavailableMessage("ENABLED"), null);
  assert.equal(nfcUnavailableMessage(undefined), null);
});

test("only Android skips startScan (its plugin rejects it); iOS keeps the scan session", () => {
  assert.equal(needsStartScan("android"), false);
  assert.equal(needsStartScan("ios"), true);
  assert.equal(needsStartScan("web"), true);
});

test("outside the app the platform is web", () => {
  assert.equal(nativePlatform(), "web");
});

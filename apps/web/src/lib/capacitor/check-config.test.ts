import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { checkGeneratedConfig } from "./check-config";
import { PRODUCTION_SERVER_URL } from "./server-url";

const PREVIEW = "https://moments-forever-n0rvwo7ov-eduardo-curys-projects.vercel.app";
const config = (url: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ appId: "com.momentsforever.app", server: { url, cleartext: false }, ...extra });

test("a correct generated file passes and says whether it is production", () => {
  const preview = checkGeneratedConfig(config(PREVIEW), PREVIEW);
  assert.deepEqual(preview.problems, []);
  assert.equal(preview.url, PREVIEW);
  assert.equal(preview.isProduction, false);
  assert.equal(checkGeneratedConfig(config(PRODUCTION_SERVER_URL)).isProduction, true);
});

test("the Markdown-formatted URL found in the broken build is rejected, never accepted as 'close enough'", () => {
  const broken = checkGeneratedConfig(config(`[${PREVIEW}](${PREVIEW})`));
  assert.ok(broken.problems.length > 0);
  assert.match(broken.problems.join("\n"), /not in canonical form/);
});

test("a stale file (the sync failed, the old URL stayed) is caught by comparing with the expected URL", () => {
  const stale = checkGeneratedConfig(config(PRODUCTION_SERVER_URL), PREVIEW);
  assert.match(stale.problems.join("\n"), /must use/);
  assert.match(stale.problems.join("\n"), /did not update/);
});

test("missing or unreadable pieces are reported", () => {
  assert.match(checkGeneratedConfig("{").problems.join(), /not valid JSON/);
  assert.match(checkGeneratedConfig(JSON.stringify({ appId: "x" })).problems.join(), /server\.url is missing/);
  assert.match(checkGeneratedConfig(config(PREVIEW, { appId: "com.other.app" })).problems.join(), /appId/);
  assert.match(
    checkGeneratedConfig(JSON.stringify({ appId: "com.momentsforever.app", server: { url: PREVIEW, cleartext: true } })).problems.join(),
    /cleartext/,
  );
  assert.match(checkGeneratedConfig(config(`${PREVIEW}/`)).problems.join(), /canonical/);
});

test("the capacitor.config.ts in the repo resolves through the same function (no second copy of the rule)", () => {
  const source = readFileSync(path.resolve(__dirname, "../../../capacitor.config.ts"), "utf8");
  assert.match(source, /resolveServerUrl\(process\.env\.CAPACITOR_SERVER_URL\)/);
  assert.match(source, /url: serverUrl/);
});

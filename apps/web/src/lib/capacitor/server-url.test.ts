import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_SERVER_URL, parseServerUrl, resolveServerUrl, unwrapPastedUrl } from "./server-url";

const PREVIEW = "https://moments-forever-n0rvwo7ov-eduardo-curys-projects.vercel.app";

test("unset or empty means production", () => {
  assert.equal(resolveServerUrl(undefined), PRODUCTION_SERVER_URL);
  assert.equal(resolveServerUrl(""), PRODUCTION_SERVER_URL);
  assert.equal(resolveServerUrl("   "), PRODUCTION_SERVER_URL);
});

test("a plain https address is used as is (the exact bug: a Markdown link ended up in server.url)", () => {
  assert.equal(resolveServerUrl(PREVIEW), PREVIEW);
  assert.equal(resolveServerUrl(`${PREVIEW}/`), PREVIEW);
  assert.equal(resolveServerUrl(`  ${PREVIEW}\n`), PREVIEW);
});

test("a URL pasted as a Markdown link, <angle brackets> or in quotes is unwrapped to the real URL", () => {
  assert.equal(resolveServerUrl(`[${PREVIEW}](${PREVIEW})`), PREVIEW);
  assert.equal(resolveServerUrl(`[Abrir preview](${PREVIEW})`), PREVIEW);
  assert.equal(resolveServerUrl(`<${PREVIEW}>`), PREVIEW);
  assert.equal(resolveServerUrl(`"${PREVIEW}"`), PREVIEW);
  assert.equal(resolveServerUrl(`'${PREVIEW}'`), PREVIEW);
  assert.equal(resolveServerUrl(`\`${PREVIEW}\``), PREVIEW);
  assert.equal(unwrapPastedUrl(`[${PREVIEW}](${PREVIEW})`), PREVIEW);
});

test("the host is lower-cased and the result never carries brackets, parentheses or a trailing slash", () => {
  const result = resolveServerUrl("HTTPS://Moments-Forever.Vercel.App/");
  assert.equal(result, "https://moments-forever.vercel.app");
  assert.doesNotMatch(result, /[\[\]()<>"'`\s]/u);
});

test("anything that is not a plain https origin fails loudly", () => {
  for (const bad of [
    "http://x.vercel.app",
    "ftp://x.vercel.app",
    "x.vercel.app",
    `${PREVIEW}/login`,
    `${PREVIEW}?a=1`,
    `${PREVIEW}#top`,
    "https://user:pw@x.vercel.app",
    "https://",
    "https://nodots",
    "not a url",
    `[${PREVIEW}](https://other.example)x`,
    `javascript:alert(1)`,
  ]) {
    assert.throws(() => resolveServerUrl(bad), /CAPACITOR_SERVER_URL is not usable/, `should reject ${bad}`);
  }
});

test("parseServerUrl explains why", () => {
  const result = parseServerUrl("http://x.vercel.app");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /https/);
});

test("localhost over https is allowed for a tunnel/dev proxy", () => {
  assert.equal(resolveServerUrl("https://localhost"), "https://localhost");
});

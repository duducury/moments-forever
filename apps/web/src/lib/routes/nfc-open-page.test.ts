import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import nextConfig from "../../../next.config";
import { config as proxyConfig } from "../../proxy";

/**
 * Opening an NFC tag link used to show a blank white page for seconds (two cold
 * server functions had to answer before the first byte). /n/<token> now serves a
 * static splash from the CDN and resolves the tag behind it. These tests keep
 * that wiring from quietly breaking.
 */
const PUBLIC = path.resolve(__dirname, "../../../public");
const html = readFileSync(path.join(PUBLIC, "nfc-abrindo.html"), "utf8");

test("the static page looks like the app's boot splash and is self-contained", () => {
  assert.match(html, /Moments Forever/);
  assert.match(html, /Colecione momentos, não coisas\./);
  assert.match(html, /Abrindo sua viagem/);
  assert.match(html, /#121110/, "same dark background as the splash");
  // First paint needs no other request: styles and the mark are inline.
  assert.match(html, /<style>/);
  assert.match(html, /src="data:image\/png;base64,/);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/);
  assert.doesNotMatch(html, /https?:\/\//, "no external requests (the only URLs are same-site paths)");
  assert.match(html, /noindex/);
});

test("the static page resolves the tag through the API and only follows same-site paths", () => {
  assert.match(html, /\/api\/nfc-link\?token=/);
  assert.match(html, /location\.replace\(path\)/);
  assert.match(html, /path\.charAt\(0\) !== "\/" \|\| path\.charAt\(1\) === "\/"/, "never leaves the site");
  // Failure shows a way out instead of an endless splash.
  assert.match(html, /Tentar de novo/);
  assert.match(html, /Não foi possível abrir agora/);
});

test("a browser opening /n/<token> is rewritten to the static page; other clients keep the 307", async () => {
  assert.equal(typeof nextConfig.rewrites, "function");
  const rewrites = await nextConfig.rewrites!();
  assert.ok(!Array.isArray(rewrites), "rewrites need the before-files phase");
  const rule = rewrites.beforeFiles?.find((entry) => entry.source === "/n/:token");
  assert.ok(rule, "rewrite for /n/:token");
  assert.equal(rule.destination, "/nfc-abrindo.html");
  const accept = rule.has?.find((condition) => condition.type === "header" && condition.key === "accept");
  assert.ok(accept && accept.type === "header" && accept.value, "only for requests that accept HTML");
  const regex = new RegExp(`^${accept.value}$`);
  assert.ok(regex.test("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"), "Safari");
  assert.equal(regex.test("*/*"), false, "curl / link preview fetchers");
  assert.equal(regex.test("application/json"), false);
});

test("the proxy stays out of the way of the static NFC page — and only of it", () => {
  const matcher = proxyConfig.matcher[0]!;
  const applies = (pathname: string) => new RegExp(`^${matcher}$`).test(pathname);
  assert.equal(applies("/n/abc123"), false, "the static splash is served without any function");
  assert.equal(applies("/n/Zx9-_k"), false);
  // Everything else still passes through (session refresh etc.).
  assert.equal(applies("/n/abc123/nao-vinculada"), true);
  assert.equal(applies("/api/nfc-link"), true, "the lookup API refreshes the session");
  assert.equal(applies("/perfil"), true);
  assert.equal(applies("/perfil/dubai/album/123"), true);
  assert.equal(applies("/"), true);
});

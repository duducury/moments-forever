import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { config as proxyConfig } from "../../proxy";
import { RESERVED_PROFILE_SLUGS } from "../profile/profile-slug";
import { GET as getAasa } from "../../app/.well-known/apple-app-site-association/route";
import {
  APPLE_APP_ID,
  UNIVERSAL_LINK_HOST,
  buildAasaComponents,
  buildAppleAppSiteAssociation,
  isUniversalLinkPath,
  parseUniversalLink,
} from "./universal-links";

const WEB = path.resolve(__dirname, "../../..");
const APP_DIR = path.join(WEB, "src/app");
const PUBLIC_DIR = path.join(WEB, "public");
const IOS_APP = path.join(WEB, "ios/App/App");

/** The only top-level routes whose subtree may open the app; every other folder is web-only. */
const OPENS_APP_ROOTS = new Set(["n", "a", "perfil"]);

test("the AASA targets the real Team ID + bundle id and the production host", () => {
  assert.equal(APPLE_APP_ID, "N774X396HW.com.momentsforever.app");
  assert.equal(UNIVERSAL_LINK_HOST, "momentsforever.vercel.app");
  const aasa = buildAppleAppSiteAssociation();
  assert.deepEqual(aasa.applinks.details[0]!.appIDs, [APPLE_APP_ID]);
});

test("links that SHOULD open the app", () => {
  for (const pathname of [
    "/n/abc123",
    "/n/abc123/nao-vinculada",
    "/a/xk29",
    "/perfil",
    "/perfil/dubai/album/6f1c",
    "/maria-silva",
    "/maria-silva/mapa",
    "/maria-silva/passaporte",
  ]) {
    assert.equal(isUniversalLinkPath(pathname), true, pathname);
  }
});

test("pages that must stay on the web do NOT open the app", () => {
  for (const pathname of [
    "/",
    "/login",
    "/auth/callback",
    "/ativar",
    "/import",
    "/geral",
    "/geral/nfc",
    "/admin",
    "/admin/users",
    "/api/nfc-link",
    "/api/profile/maria/avatar",
    "/trip/dubai",
    "/viagens",
    "/mapa",
    "/passaporte",
    "/privacidade",
    "/politica-de-privacidade",
    "/perfil/dubai", // legacy redirect to /perfil
    "/brand/logo.png",
    "/fonts/x/0-255.pbf",
    "/geo/countries.json",
    "/home/hero.jpg",
    "/premium-frames/001.jpg",
    "/premium-animation.mp4",
    "/nfc-abrindo.html",
    "/manifest.webmanifest",
    "/favicon.ico",
    "/_next/static/chunk.js",
    "/.well-known/apple-app-site-association",
  ]) {
    assert.equal(isUniversalLinkPath(pathname), false, pathname);
  }
});

test("every reserved profile slug stays on the web (except /perfil, which is decided explicitly)", () => {
  for (const slug of RESERVED_PROFILE_SLUGS) {
    if (slug === "perfil") continue;
    assert.equal(isUniversalLinkPath(`/${slug}`), false, `/${slug}`);
    assert.equal(isUniversalLinkPath(`/${slug}/qualquer`), false, `/${slug}/qualquer`);
  }
});

test("a NEW top-level route or public file cannot be captured by accident", () => {
  const roots: string[] = [];
  for (const entry of readdirSync(APP_DIR)) {
    if (!statSync(path.join(APP_DIR, entry)).isDirectory()) continue;
    if (entry === "[profileSlug]") continue; // the profile pages themselves
    roots.push(entry);
  }
  for (const entry of readdirSync(PUBLIC_DIR)) roots.push(entry);

  assert.ok(roots.length > 10, "the scan found the app folders");
  for (const root of roots) {
    if (OPENS_APP_ROOTS.has(root)) continue;
    assert.equal(
      isUniversalLinkPath(`/${root}`),
      false,
      `/${root} would open the app: add it to EXTRA_WEB_ONLY_ROOTS (or to OPENS_APP_ROOTS here on purpose)`,
    );
    assert.equal(isUniversalLinkPath(`/${root}/x`), false, `/${root}/x would open the app`);
  }
});

test("the roots that open the app are exactly the ones meant to", () => {
  assert.equal(isUniversalLinkPath("/n/token"), true);
  assert.equal(isUniversalLinkPath("/a/code"), true);
  for (const root of OPENS_APP_ROOTS) {
    assert.ok(existsSync(path.join(APP_DIR, root)), `src/app/${root} exists`);
  }
});

test("components are ordered: specific opens, then web-only exclusions, then profile pages last", () => {
  const components = buildAasaComponents();
  const patterns = components.map((c) => c["/"]);
  assert.deepEqual(patterns.slice(0, 4), ["/n/*", "/a/*", "/perfil", "/perfil/*/album/*"]);
  assert.deepEqual(patterns.slice(-3), ["/*", "/*/mapa", "/*/passaporte"]);
  assert.equal(components.slice(4, -3).every((c) => c.exclude === true), true);
});

test("the route serves the AASA as JSON", async () => {
  const response = getAasa();
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(buildAppleAppSiteAssociation())));
});

test("the proxy leaves /.well-known alone (no cookies, no function in front of the AASA)", () => {
  const matcher = proxyConfig.matcher[0]!;
  const applies = (pathname: string) => new RegExp(`^${matcher}$`).test(pathname);
  assert.equal(applies("/.well-known/apple-app-site-association"), false);
  assert.equal(applies("/perfil"), true);
  assert.equal(applies("/api/nfc-link"), true);
});

// ---- parseUniversalLink: what the native app accepts -----------------------

test("parseUniversalLink accepts public links and keeps path + query", () => {
  assert.deepEqual(parseUniversalLink("https://momentsforever.vercel.app/n/abc123"), {
    pathname: "/n/abc123",
    search: "",
  });
  assert.deepEqual(
    parseUniversalLink("https://momentsforever.vercel.app/perfil/dubai/album/6f1c?photo=99"),
    { pathname: "/perfil/dubai/album/6f1c", search: "?photo=99" },
  );
  assert.deepEqual(parseUniversalLink("https://momentsforever.vercel.app/maria/mapa"), {
    pathname: "/maria/mapa",
    search: "",
  });
});

test("parseUniversalLink rejects other hosts, schemes, credentials, ports and tricks", () => {
  for (const link of [
    "http://momentsforever.vercel.app/n/abc",
    "javascript:alert(1)",
    "com.momentsforever.app://auth/callback?code=x",
    "https://evil.example/n/abc",
    "https://momentsforever.vercel.app.evil.example/n/abc",
    "https://evil.example/https://momentsforever.vercel.app/n/abc",
    "https://user:pass@momentsforever.vercel.app/n/abc",
    "https://user@momentsforever.vercel.app/n/abc",
    "https://momentsforever.vercel.app:8443/n/abc",
    "https://momentsforever.vercel.app//evil.example/n/abc",
    "https://momentsforever.vercel.app/n/../admin",
    "https://momentsforever.vercel.app/n/%2e%2e/admin",
    "https://momentsforever.vercel.app/%61dmin/users",
    "https://momentsforever.vercel.app/n/a%5cb",
    "https://momentsforever.vercel.app/n/a%0Ab",
    "https://momentsforever.vercel.app/",
    "https://momentsforever.vercel.app/login",
    "https://momentsforever.vercel.app/admin/users",
    "https://momentsforever.vercel.app/api/nfc-link?token=x",
    "https://momentsforever.vercel.app/favicon.ico",
    "not a url",
    "",
    `https://momentsforever.vercel.app/n/${"a".repeat(3000)}`,
  ]) {
    assert.equal(parseUniversalLink(link), null, link);
  }
});

// ---- The Swift allowlist must mirror the TypeScript one --------------------

test("SceneDelegate.swift carries exactly the same rules, in the same order", () => {
  const swift = readFileSync(path.join(IOS_APP, "SceneDelegate.swift"), "utf8");
  const block = swift.match(/\/\/ BEGIN AASA RULES([\s\S]*?)\/\/ END AASA RULES/)?.[1];
  assert.ok(block, "rules block markers are present");
  const swiftRules = [...block.matchAll(/\("([^"]+)", (true|false)\)/g)].map((m) => ({
    pattern: m[1]!,
    exclude: m[2] === "true",
  }));
  const tsRules = buildAasaComponents().map((c) => ({
    pattern: c["/"],
    exclude: c.exclude === true,
  }));
  assert.deepEqual(swiftRules, tsRules);
  assert.match(swift, /static let host = "momentsforever\.vercel\.app"/);
});

test("the Swift validator checks scheme, host, credentials, port and the rules before loading", () => {
  const swift = readFileSync(path.join(IOS_APP, "SceneDelegate.swift"), "utf8");
  assert.match(swift, /scheme\?\.lowercased\(\) == "https"/);
  assert.match(swift, /host\?\.lowercased\(\) == host/);
  assert.match(swift, /components\.user == nil, components\.password == nil, components\.port == nil/);
  assert.match(swift, /guard isAllowed\(path\)/);
  // Loads on the app's own origin, never on the link's host.
  assert.match(swift, /config\.serverURL/);
});

test("the app declares the Associated Domain for the production host only", () => {
  const entitlements = readFileSync(path.join(IOS_APP, "App.entitlements"), "utf8");
  const match = entitlements.match(
    /<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/,
  );
  assert.ok(match, "associated-domains entitlement present");
  assert.deepEqual(
    [...match[1]!.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]),
    [`applinks:${UNIVERSAL_LINK_HOST}`],
  );
});

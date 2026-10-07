/**
 * Universal Links (iOS): which public URLs of the site open the app when it is
 * installed. Single source of truth for
 *   - the /.well-known/apple-app-site-association file (AASA), and
 *   - the allowlist the native SceneDelegate re-checks before loading a link
 *     (ios/App/App/SceneDelegate.swift mirrors AASA_COMPONENTS; a test keeps
 *     the two lists identical).
 *
 * Rule: only links that are meant to be shared open the app. Everything else
 * (home, login, auth, admin, API, owner-only pages, static files) stays on the
 * web. Without the app installed every one of these URLs is a normal https
 * link, so nothing here makes the site depend on the app.
 *
 * Adding a route under src/app or a file under public/ without deciding what
 * happens to it fails universal-links.test.ts on purpose.
 */

import { RESERVED_PROFILE_SLUGS } from "@/lib/profile/profile-slug";

/** Apple Developer Team ID that signs the app (same one the Xcode project uses locally). */
export const APPLE_TEAM_ID = "N774X396HW";
/** Same as the Capacitor appId / PRODUCT_BUNDLE_IDENTIFIER. */
export const IOS_BUNDLE_ID = "com.momentsforever.app";
export const APPLE_APP_ID = `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`;
/** Same as `applinks:` in App.entitlements. */
export const UNIVERSAL_LINK_HOST = "momentsforever.vercel.app";

export type AasaComponent = {
  readonly "/": string;
  readonly exclude?: true;
};

/** Shared links that always open the app. Checked first. */
const OPEN_FIRST: readonly string[] = [
  "/n/*", // NFC tag: /n/{token} (+ /nao-vinculada)
  "/a/*", // short album link
  "/perfil", // owner's own profile
  "/perfil/*/album/*", // public album
];

/**
 * Real top-level routes / folders that are NOT profile slugs and must stay on
 * the web, besides the reserved profile slugs (added automatically below).
 */
const EXTRA_WEB_ONLY_ROOTS: readonly string[] = [
  "auth",
  "ativar",
  "politica-de-privacidade",
  "brand",
  "fonts",
  "geo",
  "home",
  "premium-frames",
  ".well-known",
];

/** Profile pages: /{slug}, /{slug}/mapa, /{slug}/passaporte. Last on purpose. */
const PROFILE_PATTERNS: readonly string[] = ["/*", "/*/mapa", "/*/passaporte"];

function webOnlyRoots(): string[] {
  const roots = new Set<string>(EXTRA_WEB_ONLY_ROOTS);
  for (const slug of RESERVED_PROFILE_SLUGS) {
    // `perfil` is decided by OPEN_FIRST and the legacy-redirect rule below.
    if (slug !== "perfil") roots.add(slug);
  }
  return [...roots].sort();
}

/** Ordered like Apple evaluates them: the first matching component decides. */
export function buildAasaComponents(): AasaComponent[] {
  const components: AasaComponent[] = OPEN_FIRST.map((pattern) => ({ "/": pattern }));
  const exclude = (pattern: string): AasaComponent => ({ "/": pattern, exclude: true });

  components.push(exclude("/"));
  for (const root of webOnlyRoots()) {
    components.push(exclude(`/${root}`), exclude(`/${root}/*`));
  }
  // /perfil/{slug} (not an album) only redirects to /perfil.
  components.push(exclude("/perfil/*"));
  // Any file with an extension: favicon.ico, manifest.webmanifest, nfc-abrindo.html…
  components.push(exclude("/*.*"));

  for (const pattern of PROFILE_PATTERNS) components.push({ "/": pattern });
  return components;
}

export function buildAppleAppSiteAssociation() {
  return {
    applinks: {
      details: [{ appIDs: [APPLE_APP_ID], components: buildAasaComponents() }],
    },
  };
}

/** AASA wildcard semantics: `*` = any run of characters, `?` = one character. Case-sensitive. */
export function aasaPatternToRegExp(pattern: string): RegExp {
  let source = "";
  for (const char of pattern) {
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/** True when a path would open the app (first matching component wins). */
export function isUniversalLinkPath(
  pathname: string,
  components: readonly AasaComponent[] = buildAasaComponents(),
): boolean {
  for (const component of components) {
    if (aasaPatternToRegExp(component["/"]).test(pathname)) return !component.exclude;
  }
  return false;
}

export type UniversalLinkTarget = {
  readonly pathname: string;
  /** Includes the leading `?`, or "" when there is no query. */
  readonly search: string;
};

const MAX_LINK_LENGTH = 2048;

/**
 * Reference implementation of the check the native app runs on every link the
 * system hands it. Returns where to navigate inside the app, or null.
 * Swift (SceneDelegate.swift, UniversalLinkRouter) must behave the same.
 */
export function parseUniversalLink(raw: string): UniversalLinkTarget | null {
  if (raw.length > MAX_LINK_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== UNIVERSAL_LINK_HOST) return null;
  if (url.username || url.password || url.port) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
  if (decoded.includes("//")) return null;
  if (decoded.split("/").some((segment) => segment === "..")) return null;
  if (!isUniversalLinkPath(decoded)) return null;

  return { pathname: url.pathname, search: url.search };
}

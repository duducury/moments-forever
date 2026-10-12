/**
 * The address the native shell (Android / iOS) loads: `server.url` in capacitor.config.ts.
 * Production by default; a test build can point at another HTTPS host (a Vercel Preview, a tunnel to
 * `next dev`) with the CAPACITOR_SERVER_URL environment variable.
 *
 * Pure and dependency-free on purpose: capacitor.config.ts (loaded by the Capacitor CLI) and
 * scripts/android-config.ts both use it, and tests cover it.
 */

export const PRODUCTION_SERVER_URL = "https://momentsforever.vercel.app";

export type ServerUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string };

/**
 * A URL copied from chat, a terminal or a document often arrives wrapped: `[url](url)` (Markdown link),
 * `<url>`, or inside quotes / backticks. Taking the real URL out of those wrappers is safe (nothing else is
 * guessed); anything else that is not a plain https URL is rejected below.
 */
export function unwrapPastedUrl(raw: string): string {
  let value = raw.trim();
  for (let round = 0; round < 3; round += 1) {
    const markdown = /^\[[^\]]*\]\(([^()\s]+)\)$/u.exec(value);
    if (markdown) {
      value = markdown[1]!.trim();
      continue;
    }
    const wrapped = /^(?:<(.*)>|"(.*)"|'(.*)'|`(.*)`)$/u.exec(value);
    if (wrapped) {
      value = (wrapped[1] ?? wrapped[2] ?? wrapped[3] ?? wrapped[4] ?? "").trim();
      continue;
    }
    break;
  }
  return value;
}

/**
 * Validates one server URL and returns it in its canonical form: `https://host` with no trailing slash.
 * Only an origin is accepted (the shell uses it as the app's origin): no user info, query, fragment or path.
 */
export function parseServerUrl(raw: string): ServerUrlResult {
  const candidate = unwrapPastedUrl(raw);
  if (!/^https:\/\//iu.test(candidate)) {
    return { ok: false, reason: "it must start with https://" };
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: "it is not a valid URL" };
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/iu.test(url.hostname) && url.hostname !== "localhost") {
    return { ok: false, reason: `"${url.hostname}" is not a valid host name` };
  }
  if (url.username || url.password) return { ok: false, reason: "it must not contain a user name or password" };
  if (url.search || url.hash) return { ok: false, reason: "it must not contain a query string or fragment" };
  if (url.pathname !== "/" && url.pathname !== "") return { ok: false, reason: "it must be a bare address without a path" };
  return { ok: true, url: url.origin };
}

/**
 * The server URL for this build. `override` is CAPACITOR_SERVER_URL; empty or unset means production.
 * An invalid value throws with a clear message instead of silently building with a wrong address.
 */
export function resolveServerUrl(override: string | undefined): string {
  if (override === undefined || override.trim() === "") return PRODUCTION_SERVER_URL;
  const parsed = parseServerUrl(override);
  if (!parsed.ok) {
    throw new Error(
      `CAPACITOR_SERVER_URL is not usable (${parsed.reason}). Use a plain address such as ` +
        `https://your-preview.vercel.app (got "${override}").`,
    );
  }
  return parsed.url;
}

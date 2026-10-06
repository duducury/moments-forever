import type { CapacitorConfig } from "@capacitor/cli";

/**
 * This app is a server-rendered Next.js site, not a static export, so the
 * native shell doesn't bundle any web assets — it just points at the live
 * production site. The bundle ID / app name only matter once someone opens
 * Xcode; nothing here needs a Mac to write or review.
 */
const PRODUCTION_URL = "https://momentsforever.vercel.app";

/**
 * CAPACITOR_SERVER_URL is only for pointing a test build at another HTTPS host
 * (a Vercel preview, a tunnel to `next dev`); builds without it use production.
 * An empty value counts as "not set", and anything that is not an https:// URL
 * fails loudly — a build with no server URL would try to open a bundled
 * index.html that does not exist ("index.html couldn't be opened").
 */
function resolveServerUrl(): string {
  const override = process.env.CAPACITOR_SERVER_URL?.trim();
  if (!override) return PRODUCTION_URL;
  if (!/^https:\/\/[^\s/]+/u.test(override)) {
    throw new Error(
      `CAPACITOR_SERVER_URL must be a full https:// URL (got "${override}").`,
    );
  }
  return override.replace(/\/+$/u, "");
}

const config: CapacitorConfig = {
  appId: "com.momentsforever.app",
  appName: "Moments Forever",
  webDir: "public",
  server: {
    url: resolveServerUrl(),
    cleartext: false,
  },
  /**
   * Without this, Capacitor's WKWebView (and its scroll view) falls back to
   * UIColor.systemBackground — which follows the PHONE's OS light/dark
   * setting, not this app's own in-page theme toggle (default: dark, see
   * DEFAULT_THEME in src/lib/theme/theme.ts). On a phone set to iOS light
   * mode, that native background is white, so the area the web content
   * doesn't paint over — a frame during scroll/reload or the rubber-band
   * overscroll — shows as a white bar near the clock and battery instead of
   * matching the app. Matching it to the app's
   * default dark background (#121110, see --background in globals.css)
   * fixes that; it can't follow a live theme *toggle* since this is native
   * config baked in at build time, but it now matches the common case.
   */
  backgroundColor: "#121110",
  ios: {
    /**
     * "never": the WebView fills the whole screen and the PAGE owns the safe
     * areas through env(safe-area-inset-*) (the site already sets
     * viewport-fit=cover and pads for them, as it does in the PWA).
     *
     * It used to be "always", which makes iOS inset the scroll view natively.
     * That strip is drawn by the scroll view itself, so scrolled content
     * (cover images, headers) showed through it behind the clock / Dynamic
     * Island, no CSS could cover it, and env(safe-area-inset-top) read 0 so
     * the page's own safe-area handling never kicked in. See the status-bar
     * strip in globals.css (body::before).
     */
    contentInset: "never",
    backgroundColor: "#121110",
  },
};

export default config;

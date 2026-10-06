import type { CapacitorConfig } from "@capacitor/cli";

/**
 * This app is a server-rendered Next.js site, not a static export, so the
 * native shell doesn't bundle any web assets — it just points at the live
 * production site. The bundle ID / app name only matter once someone opens
 * Xcode; nothing here needs a Mac to write or review.
 */
const config: CapacitorConfig = {
  appId: "com.momentsforever.app",
  appName: "Moments Forever",
  webDir: "public",
  server: {
    // CAPACITOR_SERVER_URL is only for pointing a test build at another HTTPS
    // host (e.g. a tunnel to `next dev`); builds without it use production.
    url: process.env.CAPACITOR_SERVER_URL ?? "https://momentsforever.vercel.app",
    cleartext: false,
  },
  /**
   * Without this, Capacitor's WKWebView (and its scroll view) falls back to
   * UIColor.systemBackground — which follows the PHONE's OS light/dark
   * setting, not this app's own in-page theme toggle (default: dark, see
   * DEFAULT_THEME in src/lib/theme/theme.ts). On a phone set to iOS light
   * mode, that native background is white, so the area the web content
   * doesn't paint over — the status bar strip under contentInset: "always",
   * or a frame during scroll/reload — shows as a white bar near the clock
   * and battery instead of matching the app. Matching it to the app's
   * default dark background (#121110, see --background in globals.css)
   * fixes that; it can't follow a live theme *toggle* since this is native
   * config baked in at build time, but it now matches the common case.
   */
  backgroundColor: "#121110",
  ios: {
    contentInset: "always",
    backgroundColor: "#121110",
  },
};

export default config;

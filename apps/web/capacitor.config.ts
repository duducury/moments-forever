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
    url: "https://momentsforever.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;

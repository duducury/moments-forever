import type { NextConfig } from "next";

/**
 * Conservative, low-risk headers only — no script-src/style-src CSP here,
 * since that needs live testing against maplibre-gl (WASM/workers) and the
 * inlineCss experiment below, which this environment can't verify visually.
 * frame-ancestors alone doesn't touch script/style loading, so it's safe.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    inlineCss: true,
  },
  async rewrites() {
    return {
      // A browser opening an NFC tag link gets an instant static "Abrindo…" page
      // (public/nfc-abrindo.html) that resolves the tag itself; anything else
      // (link previews, curl) still reaches the 307 route handler.
      beforeFiles: [
        {
          source: "/n/:token",
          has: [{ type: "header", key: "accept", value: ".*text/html.*" }],
          destination: "/nfc-abrindo.html",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Map data and glyphs are static files (the geo files carry their data version in the name). Next serves
      // public/ with `max-age=0`, so every globe/map open revalidated 2+ MB of JSON; a day of browser cache plus
      // stale-while-revalidate removes that round trip without pinning old data for long.
      {
        source: "/geo/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;

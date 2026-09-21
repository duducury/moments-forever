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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

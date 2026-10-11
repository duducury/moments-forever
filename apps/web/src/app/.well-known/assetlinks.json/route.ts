import { buildAssetLinks, parseCertFingerprints } from "@/lib/android/app-links";

/**
 * Digital Asset Links for Android App Links (see lib/android/app-links.ts and docs/android-app-links.md).
 * Must be served as-is over https: no redirect, no auth. The certificate fingerprints come from the
 * ANDROID_APP_SHA256_FINGERPRINTS environment variable (read when the site is built); with none set
 * the answer is an empty list.
 */
export const dynamic = "force-static";

export function GET() {
  const body = buildAssetLinks(parseCertFingerprints(process.env.ANDROID_APP_SHA256_FINGERPRINTS));
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

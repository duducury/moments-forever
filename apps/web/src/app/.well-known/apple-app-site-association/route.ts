import { buildAppleAppSiteAssociation } from "@/lib/ios/universal-links";

/**
 * Apple App Site Association: tells iOS which links of this site open the app
 * (see lib/ios/universal-links.ts). Must be served as-is over https — no
 * redirect, no auth — and without a file extension.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(buildAppleAppSiteAssociation()), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

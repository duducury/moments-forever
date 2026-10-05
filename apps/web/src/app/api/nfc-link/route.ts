import {
  type NfcTagLookupClient,
  notLinkedPath,
  resolveNfcTagPath,
} from "@/lib/routes/nfc-tag-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Where an NFC tag leads, as JSON — the static "Abrindo…" page that /n/<token>
 * serves calls this and then navigates to `path` (see public/nfc-abrindo.html).
 * The lookup is the same one the 307 route does; the visibility of the trip is
 * still decided by RLS, so nothing private is revealed here beyond what
 * following the tag already revealed.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  // The lookup expects the token the way a route param carries it: percent-encoded.
  const rawToken = encodeURIComponent(token);
  try {
    const supabase = await createSupabaseServerClient();
    const path = await resolveNfcTagPath(
      supabase as unknown as NfcTagLookupClient | null,
      rawToken,
    );
    return Response.json({ path }, { headers: NO_STORE });
  } catch {
    return Response.json({ path: notLinkedPath(rawToken) }, { headers: NO_STORE });
  }
}

import {
  type NfcTagLookupClient,
  nfcTagRedirectResponse,
} from "@/lib/routes/nfc-tag-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly token: string }> },
) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  // The full client type is too deep to check against the narrow lookup
  // interface; the calls it makes are the same ones the old page made.
  return nfcTagRedirectResponse(supabase as unknown as NfcTagLookupClient | null, token);
}

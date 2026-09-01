import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The short NFC-friendly link for this album. No extra access check here —
 * RLS on `albums` already governs this read exactly like the album page
 * itself (owner, or anyone when the owner's profile is public), so anyone
 * who can already open the album can also get its short link.
 */
export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase local não configurado." },
      { status: 503 },
    );
  }

  const album = await supabase
    .from("albums")
    .select("short_code")
    .eq("id", id)
    .maybeSingle();
  if (album.error || !album.data?.short_code) {
    return NextResponse.json({ error: "Álbum não encontrado." }, { status: 404 });
  }

  const shortCode = album.data.short_code as string;
  return NextResponse.json(
    { shortCode, url: `${getSiteUrl()}/a/${shortCode}` },
    { headers: { "Cache-Control": "private, max-age=86400" } },
  );
}

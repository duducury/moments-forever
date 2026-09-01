import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Owner-only: the short NFC-friendly link for this album. */
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const album = await supabase
    .from("albums")
    .select("id, experience_id, short_code")
    .eq("id", id)
    .maybeSingle();
  if (album.error || !album.data) {
    return NextResponse.json({ error: "Álbum não encontrado." }, { status: 404 });
  }

  const experience = await supabase
    .from("experiences")
    .select("id")
    .eq("id", album.data.experience_id as string)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (experience.error || !experience.data) {
    return NextResponse.json({ error: "Álbum não encontrado." }, { status: 404 });
  }

  const shortCode = album.data.short_code as string;
  return NextResponse.json(
    { shortCode, url: `${getSiteUrl()}/a/${shortCode}` },
    { headers: { "Cache-Control": "private, max-age=86400" } },
  );
}

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Clears GPS on every photo of an owned experience.
 * Does not delete photos, albums, places, or local blobs.
 */
export async function POST(
  _request: Request,
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

  const owned = await supabase
    .from("experiences")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (owned.error || !owned.data) {
    return NextResponse.json(
      { error: "Experiência não encontrada." },
      { status: 404 },
    );
  }

  const located = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("experience_id", id)
    .not("exact_latitude", "is", null)
    .not("exact_longitude", "is", null);

  if (located.error) {
    return NextResponse.json({ error: located.error.message }, { status: 400 });
  }

  const locatedCount = located.count ?? 0;
  if (locatedCount === 0) {
    return NextResponse.json({ ok: true, updatedCount: 0 });
  }

  const updated = await supabase
    .from("photos")
    .update({ exact_latitude: null, exact_longitude: null })
    .eq("experience_id", id)
    .not("exact_latitude", "is", null)
    .not("exact_longitude", "is", null);

  if (updated.error) {
    return NextResponse.json(
      { error: updated.error.message ?? "Falha ao remover localização." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, updatedCount: locatedCount });
}

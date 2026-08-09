import { NextResponse } from "next/server";

import { identifyExperiencePlaces } from "@/lib/location/identify-experience-places";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id: experienceId } = await context.params;
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
    .eq("id", experienceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (owned.error || !owned.data) {
    return NextResponse.json(
      { error: "Experiência não encontrada." },
      { status: 404 },
    );
  }

  try {
    const result = await identifyExperiencePlaces(supabase, experienceId);
    return NextResponse.json({
      updated: result.updated,
      stats: result.stats,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível identificar os lugares.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

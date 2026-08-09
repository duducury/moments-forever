import { NextResponse } from "next/server";

import {
  mergeAlbumsInExperience,
  type MergeAlbumsMode,
} from "@/lib/experiences/merge-albums";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface MergeBody {
  readonly mode?: MergeAlbumsMode;
  readonly album_ids?: readonly string[];
  readonly target_album_id?: string;
  readonly name?: string;
}

export async function POST(
  request: Request,
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

  let body: MergeBody;
  try {
    body = (await request.json()) as MergeBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (body.mode !== "photos" && body.mode !== "nested") {
    return NextResponse.json(
      { error: 'mode deve ser "photos" ou "nested".' },
      { status: 400 },
    );
  }

  try {
    const result = await mergeAlbumsInExperience(supabase, experienceId, {
      mode: body.mode,
      albumIds: body.album_ids ?? [],
      targetAlbumId: body.target_album_id,
      name: body.name,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao juntar lugares.",
      },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

interface CreateAlbumBody {
  readonly name?: string;
  readonly parent_album_id?: string | null;
  readonly description?: string | null;
}

async function requireOwnedExperience(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  experienceId: string,
  userId: string,
) {
  const owned = await supabase
    .from("experiences")
    .select("id")
    .eq("id", experienceId)
    .eq("owner_id", userId)
    .maybeSingle();
  return !owned.error && Boolean(owned.data);
}

export async function GET(
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

  if (!(await requireOwnedExperience(supabase, experienceId, user.id))) {
    return NextResponse.json(
      { error: "Experiência não encontrada." },
      { status: 404 },
    );
  }

  const [albumsResult, photosResult] = await Promise.all([
    supabase
      .from("albums")
      .select(
        "id, experience_id, parent_album_id, name, description, cover_photo_id, position",
      )
      .eq("experience_id", experienceId)
      .order("position", { ascending: true }),
    supabase
      .from("photos")
      .select("id, album_id")
      .eq("experience_id", experienceId),
  ]);

  if (albumsResult.error) {
    return NextResponse.json(
      { error: albumsResult.error.message },
      { status: 400 },
    );
  }

  const photoCountByAlbum = new Map<string, number>();
  for (const photo of photosResult.data ?? []) {
    const albumId = photo.album_id as string | null;
    if (!albumId) continue;
    photoCountByAlbum.set(albumId, (photoCountByAlbum.get(albumId) ?? 0) + 1);
  }

  const albums = (albumsResult.data ?? []).map((album) => ({
    id: album.id as string,
    experience_id: album.experience_id as string,
    parent_album_id: (album.parent_album_id as string | null) ?? null,
    name: album.name as string,
    description: (album.description as string | null) ?? null,
    cover_photo_id: (album.cover_photo_id as string | null) ?? null,
    position: album.position as number,
    photo_count: photoCountByAlbum.get(album.id as string) ?? 0,
  }));

  return NextResponse.json({ albums });
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

  let body: CreateAlbumBody;
  try {
    body = (await request.json()) as CreateAlbumBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json(
      { error: "Nome do álbum é obrigatório." },
      { status: 400 },
    );
  }

  if (!(await requireOwnedExperience(supabase, experienceId, user.id))) {
    return NextResponse.json(
      { error: "Experiência não encontrada." },
      { status: 404 },
    );
  }

  const parentAlbumId = body.parent_album_id ?? null;
  if (parentAlbumId) {
    const parent = await supabase
      .from("albums")
      .select("id")
      .eq("id", parentAlbumId)
      .eq("experience_id", experienceId)
      .maybeSingle();
    if (parent.error || !parent.data) {
      return NextResponse.json(
        { error: "Álbum pai inválido para esta experiência." },
        { status: 400 },
      );
    }
  }

  let siblingsQuery = supabase
    .from("albums")
    .select("position")
    .eq("experience_id", experienceId)
    .order("position", { ascending: false })
    .limit(1);

  siblingsQuery = parentAlbumId
    ? siblingsQuery.eq("parent_album_id", parentAlbumId)
    : siblingsQuery.is("parent_album_id", null);

  const siblings = await siblingsQuery;
  const nextPosition = (siblings.data?.[0]?.position ?? 0) + 1;

  const created = await supabase
    .from("albums")
    .insert({
      experience_id: experienceId,
      parent_album_id: parentAlbumId,
      name,
      description: body.description?.trim() ? body.description.trim() : null,
      position: nextPosition,
    })
    .select(
      "id, experience_id, parent_album_id, name, description, cover_photo_id, position, created_at, updated_at",
    )
    .single();

  if (created.error || !created.data) {
    return NextResponse.json(
      { error: created.error?.message ?? "Falha ao criar álbum." },
      { status: 400 },
    );
  }

  return NextResponse.json({ album: created.data }, { status: 201 });
}

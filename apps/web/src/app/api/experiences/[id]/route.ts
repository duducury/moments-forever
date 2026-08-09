import { NextResponse } from "next/server";

import { deleteR2Objects, getR2Config } from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface UpdateBody {
  readonly title?: string;
  readonly description?: string | null;
  readonly starts_at?: string | null;
  readonly ends_at?: string | null;
  readonly primary_city?: string | null;
  readonly primary_country?: string | null;
  readonly cover_photo_id?: string | null;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function PATCH(
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

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
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

  const patch: Record<string, string | null> = {};

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json(
        { error: "Título não pode ser vazio." },
        { status: 400 },
      );
    }
    patch.title = title;
  }
  if (body.description !== undefined) {
    patch.description = emptyToNull(body.description);
  }
  if (body.starts_at !== undefined) {
    patch.starts_at = emptyToNull(body.starts_at);
  }
  if (body.ends_at !== undefined) {
    patch.ends_at = emptyToNull(body.ends_at);
  }
  if (body.primary_city !== undefined) {
    patch.primary_city = emptyToNull(body.primary_city);
  }
  if (body.primary_country !== undefined) {
    patch.primary_country = emptyToNull(body.primary_country);
  }
  if (body.cover_photo_id !== undefined) {
    if (body.cover_photo_id) {
      const photo = await supabase
        .from("photos")
        .select("id")
        .eq("id", body.cover_photo_id)
        .eq("experience_id", id)
        .maybeSingle();
      if (photo.error || !photo.data) {
        return NextResponse.json(
          { error: "A capa deve ser uma foto desta experiência." },
          { status: 400 },
        );
      }
      patch.cover_photo_id = body.cover_photo_id;
    } else {
      patch.cover_photo_id = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const updated = await supabase
    .from("experiences")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(
      "id, slug, title, description, starts_at, ends_at, primary_city, primary_country, cover_photo_id, status, visibility",
    )
    .single();

  if (updated.error || !updated.data) {
    return NextResponse.json(
      { error: updated.error?.message ?? "Falha ao atualizar." },
      { status: 400 },
    );
  }

  return NextResponse.json({ experience: updated.data });
}

export async function DELETE(
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

  const photos = await supabase
    .from("photos")
    .select("id, storage_key, thumbnail_storage_key")
    .eq("experience_id", id);

  if (photos.error) {
    return NextResponse.json({ error: photos.error.message }, { status: 400 });
  }

  const deletedPhotoIds = (photos.data ?? []).map((row) => row.id as string);
  const storageKeys = (photos.data ?? []).flatMap((row) =>
    [row.storage_key, row.thumbnail_storage_key].filter(
      (key): key is string => typeof key === "string" && key.length > 0,
    ),
  );

  // Clear cover FKs before cascade so RESTRICT/composite covers never block.
  const clearExperienceCover = await supabase
    .from("experiences")
    .update({ cover_photo_id: null })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (clearExperienceCover.error) {
    return NextResponse.json(
      { error: clearExperienceCover.error.message },
      { status: 400 },
    );
  }

  const clearAlbumCovers = await supabase
    .from("albums")
    .update({ cover_photo_id: null })
    .eq("experience_id", id);
  if (clearAlbumCovers.error) {
    return NextResponse.json(
      { error: clearAlbumCovers.error.message },
      { status: 400 },
    );
  }

  const deleted = await supabase
    .from("experiences")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (deleted.error) {
    return NextResponse.json(
      { error: deleted.error.message ?? "Falha ao excluir a viagem." },
      { status: 400 },
    );
  }

  if (storageKeys.length > 0 && getR2Config()) {
    try {
      await deleteR2Objects(storageKeys);
    } catch {
      // Orphan objects can be cleaned later; DB cascade already completed.
    }
  }

  return NextResponse.json({ ok: true, deleted_photo_ids: deletedPhotoIds });
}

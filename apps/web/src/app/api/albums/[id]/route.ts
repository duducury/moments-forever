import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

interface PatchAlbumBody {
  readonly name?: string;
  readonly description?: string | null;
  readonly position?: number;
  readonly parent_album_id?: string | null;
  readonly cover_photo_id?: string | null;
  readonly reorder?: "up" | "down";
  /** Full ordered photo ids for this album (drag-and-drop reorder). */
  readonly photo_order?: readonly string[];
}

async function loadOwnedAlbum(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  albumId: string,
  userId: string,
) {
  const album = await supabase
    .from("albums")
    .select(
      "id, experience_id, parent_album_id, name, description, cover_photo_id, position, source_moment_id",
    )
    .eq("id", albumId)
    .maybeSingle();

  if (album.error || !album.data) {
    return null;
  }

  const experience = await supabase
    .from("experiences")
    .select("id")
    .eq("id", album.data.experience_id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (experience.error || !experience.data) {
    return null;
  }

  return album.data;
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

  let body: PatchAlbumBody;
  try {
    body = (await request.json()) as PatchAlbumBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const album = await loadOwnedAlbum(supabase, id, user.id);
  if (!album) {
    return NextResponse.json({ error: "Álbum não encontrado." }, { status: 404 });
  }

  if (body.reorder === "up" || body.reorder === "down") {
    let siblingsQuery = supabase
      .from("albums")
      .select("id, position")
      .eq("experience_id", album.experience_id)
      .order("position", { ascending: true });

    siblingsQuery = album.parent_album_id
      ? siblingsQuery.eq("parent_album_id", album.parent_album_id)
      : siblingsQuery.is("parent_album_id", null);

    const siblings = await siblingsQuery;
    const list = siblings.data ?? [];
    const index = list.findIndex((item) => item.id === album.id);
    if (index < 0) {
      return NextResponse.json({ error: "Álbum não encontrado." }, { status: 404 });
    }

    const swapIndex = body.reorder === "up" ? index - 1 : index + 1;
    const swapWith = list[swapIndex];
    if (!swapWith) {
      return NextResponse.json({ album });
    }

    const tempPosition =
      Math.max(...list.map((item) => item.position), album.position) + 1;

    const step1 = await supabase
      .from("albums")
      .update({ position: tempPosition })
      .eq("id", album.id);
    if (step1.error) {
      return NextResponse.json({ error: step1.error.message }, { status: 400 });
    }

    const step2 = await supabase
      .from("albums")
      .update({ position: album.position })
      .eq("id", swapWith.id);
    if (step2.error) {
      return NextResponse.json({ error: step2.error.message }, { status: 400 });
    }

    const step3 = await supabase
      .from("albums")
      .update({ position: swapWith.position })
      .eq("id", album.id)
      .select(
        "id, experience_id, parent_album_id, name, description, cover_photo_id, position, created_at, updated_at",
      )
      .single();

    if (step3.error || !step3.data) {
      return NextResponse.json(
        { error: step3.error?.message ?? "Falha ao reordenar." },
        { status: 400 },
      );
    }

    return NextResponse.json({ album: step3.data });
  }

  if (Array.isArray(body.photo_order)) {
    const orderedIds = body.photo_order.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    if (orderedIds.length === 0) {
      return NextResponse.json(
        { error: "Ordem de fotos inválida." },
        { status: 400 },
      );
    }
    if (new Set(orderedIds).size !== orderedIds.length) {
      return NextResponse.json(
        { error: "Ordem de fotos com ids duplicados." },
        { status: 400 },
      );
    }

    const siblings = await supabase
      .from("photos")
      .select("id, position_in_album")
      .eq("album_id", album.id)
      .order("position_in_album", { ascending: true });

    if (siblings.error) {
      return NextResponse.json({ error: siblings.error.message }, { status: 400 });
    }

    const current = siblings.data ?? [];
    const currentIds = new Set(current.map((row) => row.id as string));
    if (
      orderedIds.length !== currentIds.size ||
      orderedIds.some((photoId) => !currentIds.has(photoId))
    ) {
      return NextResponse.json(
        { error: "A ordem deve incluir todas as fotos deste lugar." },
        { status: 400 },
      );
    }

    const maxPos = Math.max(
      0,
      ...current.map((row) =>
        typeof row.position_in_album === "number" ? row.position_in_album : 0,
      ),
    );

    // Two-phase update avoids unique (album_id, position_in_album) collisions.
    const tempUpdates = await Promise.all(
      orderedIds.map((photoId, index) =>
        supabase
          .from("photos")
          .update({ position_in_album: maxPos + 1 + index })
          .eq("id", photoId)
          .eq("album_id", album.id),
      ),
    );
    const tempError = tempUpdates.find((result) => result.error)?.error;
    if (tempError) {
      return NextResponse.json({ error: tempError.message }, { status: 400 });
    }

    const finalUpdates = await Promise.all(
      orderedIds.map((photoId, index) =>
        supabase
          .from("photos")
          .update({ position_in_album: index + 1 })
          .eq("id", photoId)
          .eq("album_id", album.id),
      ),
    );
    const finalError = finalUpdates.find((result) => result.error)?.error;
    if (finalError) {
      return NextResponse.json({ error: finalError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, photo_order: orderedIds });
  }

  const patch: Record<string, string | number | null> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Nome do álbum não pode ser vazio." },
        { status: 400 },
      );
    }
    patch.name = name;
  }

  if (body.description !== undefined) {
    const trimmed = body.description?.trim() ?? "";
    patch.description = trimmed.length > 0 ? trimmed : null;
  }

  if (body.position !== undefined) {
    if (!Number.isInteger(body.position) || body.position < 1) {
      return NextResponse.json(
        { error: "Posição inválida." },
        { status: 400 },
      );
    }
    patch.position = body.position;
  }

  if (body.parent_album_id !== undefined) {
    if (body.parent_album_id === album.id) {
      return NextResponse.json(
        { error: "Álbum não pode ser pai de si mesmo." },
        { status: 400 },
      );
    }
    if (body.parent_album_id) {
      const parent = await supabase
        .from("albums")
        .select("id")
        .eq("id", body.parent_album_id)
        .eq("experience_id", album.experience_id)
        .maybeSingle();
      if (parent.error || !parent.data) {
        return NextResponse.json(
          { error: "Álbum pai inválido." },
          { status: 400 },
        );
      }
    }
    patch.parent_album_id = body.parent_album_id;
  }

  if (body.cover_photo_id !== undefined) {
    if (body.cover_photo_id) {
      const photo = await supabase
        .from("photos")
        .select("id")
        .eq("id", body.cover_photo_id)
        .eq("experience_id", album.experience_id)
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
    .from("albums")
    .update(patch)
    .eq("id", id)
    .select(
      "id, experience_id, parent_album_id, name, description, cover_photo_id, position, source_moment_id, created_at, updated_at",
    )
    .single();

  if (updated.error || !updated.data) {
    return NextResponse.json(
      { error: updated.error?.message ?? "Falha ao atualizar álbum." },
      { status: 400 },
    );
  }

  // Renaming confirms the linked place label without changing GPS.
  if (typeof patch.name === "string" && updated.data.source_moment_id) {
    const moment = await supabase
      .from("moments")
      .select("id, place_id")
      .eq("id", updated.data.source_moment_id)
      .maybeSingle();

    if (moment.data?.place_id) {
      await supabase
        .from("places")
        .update({
          name: patch.name,
          confirmed_by_user: true,
        })
        .eq("id", moment.data.place_id);

      await supabase
        .from("moments")
        .update({ title: patch.name })
        .eq("id", moment.data.id);
    }
  }

  return NextResponse.json({ album: updated.data });
}

export async function DELETE(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await context.params;
  const force =
    new URL(request.url).searchParams.get("force") === "1" ||
    new URL(request.url).searchParams.get("force") === "true";

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

  const album = await loadOwnedAlbum(supabase, id, user.id);
  if (!album) {
    return NextResponse.json({ error: "Álbum não encontrado." }, { status: 404 });
  }

  if (!force) {
    const [photos, children] = await Promise.all([
      supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("album_id", id),
      supabase
        .from("albums")
        .select("id", { count: "exact", head: true })
        .eq("parent_album_id", id),
    ]);

    if ((photos.count ?? 0) > 0 || (children.count ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Só é possível excluir álbuns vazios (sem fotos e sem subálbuns). Use force=1 para excluir com conteúdo.",
        },
        { status: 409 },
      );
    }

    const deleted = await supabase.from("albums").delete().eq("id", id);
    if (deleted.error) {
      return NextResponse.json(
        { error: deleted.error.message ?? "Falha ao excluir álbum." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, deleted_photo_ids: [] as string[] });
  }

  // Force: delete photos in this album tree, then albums bottom-up.
  const allAlbums = await supabase
    .from("albums")
    .select("id, parent_album_id")
    .eq("experience_id", album.experience_id);

  if (allAlbums.error) {
    return NextResponse.json(
      { error: allAlbums.error.message },
      { status: 400 },
    );
  }

  const byParent = new Map<string, string[]>();
  for (const row of allAlbums.data ?? []) {
    const parent = (row.parent_album_id as string | null) ?? null;
    if (!parent) continue;
    const list = byParent.get(parent) ?? [];
    list.push(row.id as string);
    byParent.set(parent, list);
  }

  const treeIds: string[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || treeIds.includes(current)) continue;
    treeIds.push(current);
    for (const child of byParent.get(current) ?? []) {
      stack.push(child);
    }
  }

  const photosInTree = await supabase
    .from("photos")
    .select("id")
    .eq("experience_id", album.experience_id)
    .in("album_id", treeIds);

  if (photosInTree.error) {
    return NextResponse.json(
      { error: photosInTree.error.message },
      { status: 400 },
    );
  }

  const deletedPhotoIds = (photosInTree.data ?? []).map(
    (row) => row.id as string,
  );

  if (deletedPhotoIds.length > 0) {
    const deletedPhotos = await supabase
      .from("photos")
      .delete()
      .in("id", deletedPhotoIds)
      .eq("experience_id", album.experience_id);
    if (deletedPhotos.error) {
      return NextResponse.json(
        { error: deletedPhotos.error.message },
        { status: 400 },
      );
    }
  }

  // Children first (deepest), then root of the subtree.
  for (let pass = 0; pass < treeIds.length + 2; pass += 1) {
    let removed = 0;
    for (const albumId of [...treeIds].reverse()) {
      const stillChildren = await supabase
        .from("albums")
        .select("id", { count: "exact", head: true })
        .eq("parent_album_id", albumId);
      if ((stillChildren.count ?? 0) > 0) continue;
      const deleted = await supabase
        .from("albums")
        .delete()
        .eq("id", albumId)
        .eq("experience_id", album.experience_id);
      if (!deleted.error) removed += 1;
    }
    if (removed === 0) break;
  }

  return NextResponse.json({ ok: true, deleted_photo_ids: deletedPhotoIds });
}

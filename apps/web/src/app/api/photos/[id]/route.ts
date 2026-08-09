import { NextResponse } from "next/server";

import { deleteR2Objects, getR2Config } from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface PatchPhotoBody {
  readonly album_id?: string;
  readonly position_in_album?: number;
  readonly reorder?: "up" | "down";
  readonly set_as_cover?: "album" | "experience";
  /** Clears photos.exact_latitude / exact_longitude only. Does not delete the photo. */
  readonly remove_location?: boolean;
}

async function loadOwnedPhoto(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  photoId: string,
  userId: string,
) {
  const photo = await supabase
    .from("photos")
    .select(
      "id, experience_id, album_id, moment_id, position_in_album, position_in_moment, storage_key, thumbnail_storage_key",
    )
    .eq("id", photoId)
    .maybeSingle();

  if (photo.error || !photo.data) return null;

  const experience = await supabase
    .from("experiences")
    .select("id")
    .eq("id", photo.data.experience_id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (experience.error || !experience.data) return null;
  return photo.data;
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

  let body: PatchPhotoBody;
  try {
    body = (await request.json()) as PatchPhotoBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const photo = await loadOwnedPhoto(supabase, id, user.id);
  if (!photo) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  if (body.remove_location === true) {
    const updated = await supabase
      .from("photos")
      .update({ exact_latitude: null, exact_longitude: null })
      .eq("id", id)
      .select(
        "id, experience_id, album_id, moment_id, position_in_album, position_in_moment, captured_at, width, height, exact_latitude, exact_longitude",
      )
      .single();
    if (updated.error || !updated.data) {
      return NextResponse.json(
        { error: updated.error?.message ?? "Falha ao remover localização." },
        { status: 400 },
      );
    }
    return NextResponse.json({ photo: updated.data });
  }

  if (body.set_as_cover === "experience") {
    const updated = await supabase
      .from("experiences")
      .update({ cover_photo_id: photo.id })
      .eq("id", photo.experience_id)
      .select("id, cover_photo_id")
      .single();
    if (updated.error) {
      return NextResponse.json({ error: updated.error.message }, { status: 400 });
    }
    return NextResponse.json({ photo, experience: updated.data });
  }

  if (body.set_as_cover === "album") {
    if (!photo.album_id) {
      return NextResponse.json(
        { error: "Foto sem álbum para definir capa." },
        { status: 400 },
      );
    }
    const updated = await supabase
      .from("albums")
      .update({ cover_photo_id: photo.id })
      .eq("id", photo.album_id)
      .eq("experience_id", photo.experience_id)
      .select("id, cover_photo_id")
      .single();
    if (updated.error) {
      return NextResponse.json({ error: updated.error.message }, { status: 400 });
    }
    return NextResponse.json({ photo, album: updated.data });
  }

  if (body.reorder === "up" || body.reorder === "down") {
    if (!photo.album_id || photo.position_in_album === null) {
      return NextResponse.json(
        { error: "Foto sem posição no álbum." },
        { status: 400 },
      );
    }

    const siblings = await supabase
      .from("photos")
      .select("id, position_in_album")
      .eq("album_id", photo.album_id)
      .order("position_in_album", { ascending: true });

    const list = siblings.data ?? [];
    const index = list.findIndex((item) => item.id === photo.id);
    if (index < 0) {
      return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
    }

    const swapIndex = body.reorder === "up" ? index - 1 : index + 1;
    const swapWith = list[swapIndex];
    if (!swapWith || swapWith.position_in_album === null) {
      return NextResponse.json({ photo });
    }

    const currentPos = photo.position_in_album;
    const swapPos = swapWith.position_in_album;
    const temp =
      Math.max(...list.map((item) => item.position_in_album ?? 0), currentPos) +
      1;

    const step1 = await supabase
      .from("photos")
      .update({ position_in_album: temp })
      .eq("id", photo.id);
    if (step1.error) {
      return NextResponse.json({ error: step1.error.message }, { status: 400 });
    }
    const step2 = await supabase
      .from("photos")
      .update({ position_in_album: currentPos })
      .eq("id", swapWith.id);
    if (step2.error) {
      return NextResponse.json({ error: step2.error.message }, { status: 400 });
    }
    const step3 = await supabase
      .from("photos")
      .update({ position_in_album: swapPos })
      .eq("id", photo.id)
      .select(
        "id, experience_id, album_id, moment_id, position_in_album, position_in_moment",
      )
      .single();
    if (step3.error || !step3.data) {
      return NextResponse.json(
        { error: step3.error?.message ?? "Falha ao reordenar." },
        { status: 400 },
      );
    }
    return NextResponse.json({ photo: step3.data });
  }

  const patch: Record<string, string | number | null> = {};

  if (body.album_id !== undefined) {
    const targetAlbum = await supabase
      .from("albums")
      .select("id")
      .eq("id", body.album_id)
      .eq("experience_id", photo.experience_id)
      .maybeSingle();
    if (targetAlbum.error || !targetAlbum.data) {
      return NextResponse.json(
        { error: "Álbum de destino inválido." },
        { status: 400 },
      );
    }

    const maxPos = await supabase
      .from("photos")
      .select("position_in_album")
      .eq("album_id", body.album_id)
      .order("position_in_album", { ascending: false })
      .limit(1);

    patch.album_id = body.album_id;
    patch.position_in_album =
      body.position_in_album ??
      (maxPos.data?.[0]?.position_in_album ?? 0) + 1;
  }

  if (body.position_in_album !== undefined && body.album_id === undefined) {
    if (!Number.isInteger(body.position_in_album) || body.position_in_album < 1) {
      return NextResponse.json({ error: "Posição inválida." }, { status: 400 });
    }
    patch.position_in_album = body.position_in_album;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const updated = await supabase
    .from("photos")
    .update(patch)
    .eq("id", id)
    .select(
      "id, experience_id, album_id, moment_id, position_in_album, position_in_moment, captured_at, width, height, exact_latitude, exact_longitude",
    )
    .single();

  if (updated.error || !updated.data) {
    return NextResponse.json(
      { error: updated.error?.message ?? "Falha ao atualizar foto." },
      { status: 400 },
    );
  }

  return NextResponse.json({ photo: updated.data });
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

  const photo = await loadOwnedPhoto(supabase, id, user.id);
  if (!photo) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  const storageKeys = [photo.storage_key, photo.thumbnail_storage_key].filter(
    (key): key is string => typeof key === "string" && key.length > 0,
  );

  // Delete DB first so the app never shows a photo without a row.
  const deleted = await supabase.from("photos").delete().eq("id", id);
  if (deleted.error) {
    return NextResponse.json(
      { error: deleted.error.message ?? "Falha ao excluir foto." },
      { status: 400 },
    );
  }

  if (storageKeys.length > 0 && getR2Config()) {
    try {
      await deleteR2Objects(storageKeys);
    } catch {
      // Orphan objects can be cleaned later; DB is already consistent.
    }
  }

  return NextResponse.json({ ok: true });
}

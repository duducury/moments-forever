import { NextResponse } from "next/server";

import {
  buildPhotoObjectKey,
  parsePhotoObjectKey,
  r2ObjectExists,
} from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface ConfirmBody {
  readonly photoId?: string;
  readonly experienceId?: string;
  readonly storageKey?: string | null;
  readonly thumbnailStorageKey?: string | null;
}

export async function POST(request: Request) {
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

  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const photoId = body.photoId?.trim() ?? "";
  const experienceId = body.experienceId?.trim() ?? "";
  if (!photoId || !experienceId) {
    return NextResponse.json(
      { error: "photoId e experienceId são obrigatórios." },
      { status: 400 },
    );
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

  const photo = await supabase
    .from("photos")
    .select("id, experience_id, storage_key, thumbnail_storage_key")
    .eq("id", photoId)
    .eq("experience_id", experienceId)
    .maybeSingle();
  if (photo.error || !photo.data) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  const expectedOriginal = buildPhotoObjectKey({
    userId: user.id,
    experienceId,
    photoId,
    variant: "original",
  });
  const expectedThumb = buildPhotoObjectKey({
    userId: user.id,
    experienceId,
    photoId,
    variant: "thumbnail",
  });

  const patch: {
    storage_key?: string | null;
    thumbnail_storage_key?: string | null;
  } = {};

  if (body.storageKey !== undefined) {
    if (body.storageKey === null) {
      patch.storage_key = null;
    } else {
      const parsed = parsePhotoObjectKey(body.storageKey);
      if (
        !parsed ||
        parsed.userId !== user.id ||
        parsed.experienceId !== experienceId ||
        parsed.photoId !== photoId ||
        parsed.variant !== "original" ||
        body.storageKey !== expectedOriginal
      ) {
        return NextResponse.json(
          { error: "storageKey inválida." },
          { status: 400 },
        );
      }
      const exists = await r2ObjectExists(body.storageKey);
      if (!exists) {
        return NextResponse.json(
          { error: "Objeto original não encontrado no armazenamento." },
          { status: 400 },
        );
      }
      patch.storage_key = body.storageKey;
    }
  }

  if (body.thumbnailStorageKey !== undefined) {
    if (body.thumbnailStorageKey === null) {
      patch.thumbnail_storage_key = null;
    } else {
      const parsed = parsePhotoObjectKey(body.thumbnailStorageKey);
      if (
        !parsed ||
        parsed.userId !== user.id ||
        parsed.experienceId !== experienceId ||
        parsed.photoId !== photoId ||
        parsed.variant !== "thumbnail" ||
        body.thumbnailStorageKey !== expectedThumb
      ) {
        return NextResponse.json(
          { error: "thumbnailStorageKey inválida." },
          { status: 400 },
        );
      }
      const exists = await r2ObjectExists(body.thumbnailStorageKey);
      if (!exists) {
        return NextResponse.json(
          { error: "Thumbnail não encontrada no armazenamento." },
          { status: 400 },
        );
      }
      patch.thumbnail_storage_key = body.thumbnailStorageKey;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para confirmar." }, { status: 400 });
  }

  const updated = await supabase
    .from("photos")
    .update(patch)
    .eq("id", photoId)
    .eq("experience_id", experienceId)
    .select("id, experience_id, storage_key, thumbnail_storage_key")
    .single();

  if (updated.error || !updated.data) {
    return NextResponse.json(
      { error: updated.error?.message ?? "Falha ao confirmar armazenamento." },
      { status: 400 },
    );
  }

  return NextResponse.json({ photo: updated.data });
}

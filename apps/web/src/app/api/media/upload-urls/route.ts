import { NextResponse } from "next/server";

import { parseUploadUrlItems } from "@/lib/storage/media-batch";
import {
  buildPhotoObjectKey,
  createPresignedPutUrl,
  getR2Config,
} from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Presigned PUT URLs for several photos of ONE experience in a single request: one sign-in check, one ownership
 * check and one photos query for the whole batch (the single-photo route pays all three per variant). Same rules as
 * `/api/media/upload-url`; keys are derived from the user, the experience and the photo.
 */
export async function POST(request: Request) {
  if (!getR2Config()) {
    return NextResponse.json({ error: "Armazenamento R2 não configurado." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase local não configurado." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: { readonly experienceId?: string; readonly items?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const experienceId = body.experienceId?.trim() ?? "";
  const items = parseUploadUrlItems(body.items);
  if (!experienceId || !items) {
    return NextResponse.json(
      { error: "experienceId e uma lista válida de fotos são obrigatórios." },
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
    return NextResponse.json({ error: "Experiência não encontrada." }, { status: 404 });
  }

  const photoIds = [...new Set(items.map((item) => item.photoId))];
  const found = await supabase
    .from("photos")
    .select("id")
    .in("id", photoIds)
    .eq("experience_id", experienceId);
  if (found.error) {
    return NextResponse.json({ error: "Não foi possível preparar o upload." }, { status: 500 });
  }
  const existing = new Set((found.data ?? []).map((row) => row.id as string));

  const results = await Promise.all(
    items.map(async (item) => {
      if (!existing.has(item.photoId)) {
        return { photoId: item.photoId, variant: item.variant, error: "Foto não encontrada." };
      }
      const key = buildPhotoObjectKey({
        userId: user.id,
        experienceId,
        photoId: item.photoId,
        variant: item.variant,
      });
      try {
        const uploadUrl = await createPresignedPutUrl({ key, contentType: item.contentType });
        return { photoId: item.photoId, variant: item.variant, uploadUrl, key };
      } catch {
        return { photoId: item.photoId, variant: item.variant, error: "Não foi possível preparar o upload." };
      }
    }),
  );

  return NextResponse.json({ items: results, expiresInSeconds: 60 * 15 });
}

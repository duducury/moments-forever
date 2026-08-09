import { NextResponse } from "next/server";

import {
  buildPhotoObjectKey,
  createPresignedPutUrl,
  getR2Config,
  type R2PhotoVariant,
} from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface UploadUrlBody {
  readonly photoId?: string;
  readonly experienceId?: string;
  readonly variant?: R2PhotoVariant;
  readonly contentType?: string;
}

export async function POST(request: Request) {
  if (!getR2Config()) {
    return NextResponse.json(
      { error: "Armazenamento R2 não configurado." },
      { status: 503 },
    );
  }

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

  let body: UploadUrlBody;
  try {
    body = (await request.json()) as UploadUrlBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const photoId = body.photoId?.trim() ?? "";
  const experienceId = body.experienceId?.trim() ?? "";
  const variant = body.variant;
  const contentType = body.contentType?.trim() || "application/octet-stream";

  if (!photoId || !experienceId) {
    return NextResponse.json(
      { error: "photoId e experienceId são obrigatórios." },
      { status: 400 },
    );
  }
  if (variant !== "original" && variant !== "thumbnail") {
    return NextResponse.json(
      { error: 'variant deve ser "original" ou "thumbnail".' },
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
    .select("id, experience_id")
    .eq("id", photoId)
    .eq("experience_id", experienceId)
    .maybeSingle();
  if (photo.error || !photo.data) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  const key = buildPhotoObjectKey({
    userId: user.id,
    experienceId,
    photoId,
    variant,
  });

  try {
    const uploadUrl = await createPresignedPutUrl({ key, contentType });
    return NextResponse.json({
      uploadUrl,
      key,
      variant,
      expiresInSeconds: 60 * 15,
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível preparar o upload." },
      { status: 500 },
    );
  }
}

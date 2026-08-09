import { NextResponse } from "next/server";

import { createPresignedGetUrl, getR2Config } from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeVariant(raw: string | null): "original" | "thumbnail" {
  if (raw === "thumbnail") return "thumbnail";
  return "original";
}

async function canReadPhoto(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  photoId: string,
  userId: string | null,
): Promise<{
  readonly storageKey: string | null;
  readonly thumbnailStorageKey: string | null;
} | null> {
  const plain = await supabase
    .from("photos")
    .select("id, experience_id, storage_key, thumbnail_storage_key")
    .eq("id", photoId)
    .maybeSingle();
  if (plain.error || !plain.data) return null;

  const experience = await supabase
    .from("experiences")
    .select("id, owner_id")
    .eq("id", plain.data.experience_id)
    .maybeSingle();
  if (experience.error || !experience.data) return null;

  const keys = {
    storageKey: (plain.data.storage_key as string | null) ?? null,
    thumbnailStorageKey:
      (plain.data.thumbnail_storage_key as string | null) ?? null,
  };

  if (userId && experience.data.owner_id === userId) {
    return keys;
  }

  const owner = await supabase
    .from("users")
    .select("id, profile_slug")
    .eq("id", experience.data.owner_id)
    .maybeSingle();

  if (owner.data?.profile_slug) {
    return keys;
  }

  return null;
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly photoId: string }> },
) {
  if (!getR2Config()) {
    return NextResponse.json(
      { error: "Armazenamento R2 não configurado." },
      { status: 503 },
    );
  }

  const { photoId } = await context.params;
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

  const access = await canReadPhoto(supabase, photoId, user?.id ?? null);
  if (!access) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  const url = new URL(request.url);
  const variant = normalizeVariant(url.searchParams.get("variant"));
  const key =
    variant === "thumbnail"
      ? (access.thumbnailStorageKey ?? access.storageKey)
      : (access.storageKey ?? access.thumbnailStorageKey);

  if (!key) {
    return NextResponse.json(
      { error: "Foto sem arquivo permanente." },
      { status: 404 },
    );
  }

  try {
    const signedUrl = await createPresignedGetUrl({
      key,
      expiresInSeconds: 60 * 30,
    });
    return NextResponse.redirect(signedUrl, 302);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gerar acesso à foto." },
      { status: 500 },
    );
  }
}

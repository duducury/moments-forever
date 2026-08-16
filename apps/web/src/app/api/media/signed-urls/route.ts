import { NextResponse } from "next/server";

import {
  assertR2Configured,
  canReadPhotos,
  createMemoizedPresignedGetUrl,
  storageKeyForVariant,
  type MediaVariant,
} from "@/lib/media/photo-media-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_IDS = 48;

type Body = {
  readonly photoIds?: unknown;
  readonly variants?: unknown;
};

function parseVariants(raw: unknown): readonly MediaVariant[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return ["full", "thumbnail"];
  }
  const variants = raw.filter(
    (value): value is MediaVariant =>
      value === "full" || value === "thumbnail",
  );
  return variants.length > 0 ? variants : ["full", "thumbnail"];
}

export async function POST(request: Request) {
  if (!assertR2Configured()) {
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const photoIds = Array.isArray(body.photoIds)
    ? body.photoIds
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .slice(0, MAX_IDS)
    : [];
  if (photoIds.length === 0) {
    return NextResponse.json({ error: "photoIds obrigatório." }, { status: 400 });
  }

  const variants = parseVariants(body.variants);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accessById = await canReadPhotos(
    supabase,
    photoIds,
    user?.id ?? null,
  );

  const urls: Record<
    string,
    { full?: string; thumbnail?: string }
  > = {};
  let expiresAt = Date.now() + 60 * 30 * 1000;

  await Promise.all(
    photoIds.map(async (photoId) => {
      const access = accessById.get(photoId);
      if (!access) return;
      const entry: { full?: string; thumbnail?: string } = {};
      for (const variant of variants) {
        const key = storageKeyForVariant(access, variant);
        if (!key) continue;
        try {
          const signed = await createMemoizedPresignedGetUrl(key);
          entry[variant] = signed.url;
          expiresAt = Math.min(expiresAt, signed.expiresAtMs);
        } catch {
          // Skip failed signs; client falls back to redirect route.
        }
      }
      if (entry.full || entry.thumbnail) {
        urls[photoId] = entry;
      }
    }),
  );

  return NextResponse.json(
    { urls, expiresAt },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}

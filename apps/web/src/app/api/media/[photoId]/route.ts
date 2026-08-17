import { NextResponse } from "next/server";

import { mediaCacheControl } from "@/lib/media/media-url";
import {
  assertR2Configured,
  createMemoizedPresignedGetUrl,
  loadReadablePhotoKeys,
  storageKeyForVariant,
  type MediaVariant,
  type PhotoStorageKeys,
} from "@/lib/media/photo-media-access";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getR2ObjectStream } from "@/lib/storage/r2";

async function resolvePhotoAccess(
  photoId: string,
): Promise<{ readonly keys: PhotoStorageKeys; readonly publicCache: boolean } | null> {
  const anon = createSupabaseAnonClient();
  if (anon) {
    const publicKeys = await loadReadablePhotoKeys(anon, photoId);
    if (publicKeys) {
      return { keys: publicKeys, publicCache: true };
    }
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const ownerKeys = await loadReadablePhotoKeys(supabase, photoId);
  if (!ownerKeys) return null;
  return { keys: ownerKeys, publicCache: false };
}

function mediaHeaders(input: {
  readonly contentType: string;
  readonly contentLength: number | null;
  readonly etag: string | null;
  readonly publicCache: boolean;
}): Headers {
  const headers = new Headers();
  headers.set("Content-Type", input.contentType);
  headers.set("Cache-Control", mediaCacheControl(input.publicCache));
  if (input.publicCache) {
    headers.set("CDN-Cache-Control", mediaCacheControl(true));
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Accept-Ranges", "bytes");
  if (input.contentLength != null) {
    headers.set("Content-Length", String(input.contentLength));
  }
  if (input.etag) {
    headers.set("ETag", input.etag);
  }
  return headers;
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly photoId: string }> },
) {
  if (!assertR2Configured()) {
    return NextResponse.json(
      { error: "Armazenamento R2 não configurado." },
      { status: 503 },
    );
  }

  const { photoId } = await context.params;
  const access = await resolvePhotoAccess(photoId);
  if (!access) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  const url = new URL(request.url);
  const clientVariant = (url.searchParams.get("variant") ?? "full") as
    | MediaVariant
    | "original";
  const variant: MediaVariant =
    clientVariant === "thumbnail" ? "thumbnail" : "full";
  const key = storageKeyForVariant(access.keys, variant);

  if (!key) {
    return NextResponse.json(
      { error: "Foto sem arquivo permanente." },
      { status: 404 },
    );
  }

  try {
    if (url.searchParams.get("json") === "1") {
      const signed = await createMemoizedPresignedGetUrl(key);
      return NextResponse.json(
        {
          url: signed.url,
          expiresAt: signed.expiresAtMs,
          variant,
        },
        {
          headers: {
            "Cache-Control": "private, max-age=240",
          },
        },
      );
    }

    const object = await getR2ObjectStream({ key });
    if (!object) {
      return NextResponse.json(
        { error: "Foto sem arquivo permanente." },
        { status: 404 },
      );
    }

    const requestEtag = request.headers.get("if-none-match");
    if (object.etag && requestEtag && requestEtag === object.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: mediaHeaders({
          contentType: object.contentType,
          contentLength: null,
          etag: object.etag,
          publicCache: access.publicCache,
        }),
      });
    }

    return new NextResponse(object.body, {
      status: 200,
      headers: mediaHeaders({
        contentType: object.contentType,
        contentLength: object.contentLength,
        etag: object.etag,
        publicCache: access.publicCache,
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gerar acesso à foto." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { mediaCacheControl } from "@/lib/media/media-url";
import {
  assertR2Configured,
  storageKeyForVariant,
} from "@/lib/media/photo-media-access";
import { loadPublicAlbumCover } from "@/lib/share/load-album-share-preview";
import { absoluteUrl } from "@/lib/site-url";
import { getR2ObjectBytes } from "@/lib/storage/r2";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function brandIconRedirect() {
  return NextResponse.redirect(absoluteUrl("/brand/icon-512.png"), 302);
}

/**
 * Public album-cover bytes for share previews (WhatsApp / Open Graph).
 * Readable when the owner's profile is public — no session required.
 */
export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id: raw } = await context.params;
  const albumId = decodeURIComponent(raw).trim();
  if (!albumId) {
    return NextResponse.json({ error: "Álbum não encontrado." }, { status: 404 });
  }

  if (!assertR2Configured()) {
    return brandIconRedirect();
  }

  const supabase =
    createSupabaseAnonClient() ?? (await createSupabaseServerClient());
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase local não configurado." },
      { status: 503 },
    );
  }

  const cover = await loadPublicAlbumCover(supabase, albumId);
  if (!cover) {
    return NextResponse.json({ error: "Álbum não encontrado." }, { status: 404 });
  }

  const key = storageKeyForVariant(
    {
      storageKey: cover.storageKey,
      thumbnailStorageKey: cover.thumbnailStorageKey,
    },
    "thumbnail",
  );
  if (!key) {
    return brandIconRedirect();
  }

  const object = await getR2ObjectBytes({ key });
  if (!object) {
    return brandIconRedirect();
  }

  return new NextResponse(Buffer.from(object.body), {
    status: 200,
    headers: {
      "content-type": object.contentType,
      "cache-control": mediaCacheControl(true),
      "x-content-type-options": "nosniff",
    },
  });
}

import { NextResponse } from "next/server";

import {
  assertR2Configured,
  canReadPhoto,
  createMemoizedPresignedGetUrl,
  normalizeMediaVariant,
  storageKeyForVariant,
  type MediaVariant,
} from "@/lib/media/photo-media-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase local não configurado." },
      { status: 503 },
    );
  }

  // Cookie session is enough for owner vs public — skip getUser() network round-trip.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const access = await canReadPhoto(
    supabase,
    photoId,
    session?.user?.id ?? null,
  );
  if (!access) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  const url = new URL(request.url);
  const clientVariant = (url.searchParams.get("variant") ?? "full") as
    | MediaVariant
    | "original";
  const variant: MediaVariant =
    clientVariant === "thumbnail" ? "thumbnail" : "full";
  const key = storageKeyForVariant(access, variant);
  // Keep normalize for defensive logging parity with older clients.
  void normalizeMediaVariant(url.searchParams.get("variant"));

  if (!key) {
    return NextResponse.json(
      { error: "Foto sem arquivo permanente." },
      { status: 404 },
    );
  }

  try {
    const signed = await createMemoizedPresignedGetUrl(key);
    if (url.searchParams.get("json") === "1") {
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
    const response = NextResponse.redirect(signed.url, 302);
    // Signed Location is memoized ~25 min; let the browser reuse this hop.
    response.headers.set("Cache-Control", "private, max-age=240");
    return response;
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gerar acesso à foto." },
      { status: 500 },
    );
  }
}

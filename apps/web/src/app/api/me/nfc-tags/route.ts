import { NextResponse } from "next/server";

import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import { getUserLicense } from "@/lib/licensing/get-user-license";
import { shapeOwnerNfcTrips } from "@/lib/nfc/shape-owner-nfc-trips";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function nfcUrl(token: string): string {
  return `${getSiteUrl()}/n/${token}`;
}

/**
 * All of the owner's destinations (root albums) + their NFC tag status, for
 * the "Ativar NFC" list. One row per root album, never deduplicated by
 * experience — an experience can have several root albums (e.g. "Dubai" and
 * "Bali" under one import trip), each independently taggable. A tag is
 * looked up by album_id, not by experience, so two destinations sharing an
 * experience never share a tag.
 */
export async function GET() {
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

  const [{ places, error }, license] = await Promise.all([
    loadOwnerPlaceCards(supabase, user.id),
    getUserLicense(supabase, user.id),
  ]);

  if (error || !places) {
    return NextResponse.json(
      { error: error ?? "Não foi possível carregar as viagens." },
      { status: 400 },
    );
  }

  const albumIds = places.map((place) => place.albumId);
  const tags =
    albumIds.length > 0
      ? await supabase
          .from("nfc_tags")
          .select("album_id, token")
          .eq("user_id", user.id)
          .in("album_id", albumIds)
      : { data: [] as Array<{ album_id: string; token: string }> };

  const tokenByAlbumId = new Map(
    (tags.data ?? []).map((row) => [
      row.album_id as string,
      row.token as string,
    ]),
  );

  return NextResponse.json({
    trips: shapeOwnerNfcTrips(places, tokenByAlbumId, nfcUrl),
    usedCount: tokenByAlbumId.size,
    maxNfcTags: license?.maxNfcTags ?? null,
  });
}

import { NextResponse } from "next/server";

import { loadOwnerMapPhotos } from "@/lib/experiences/load-owner-map-photos";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in owner's GPS photos (id, album, position, time) — the data the
 * "Compartilhe sua jornada" image draws its map from. Owner only; same rows
 * the profile map already reads.
 */
export async function GET() {
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

  const photos = await loadOwnerMapPhotos(supabase, user.id);
  return NextResponse.json(
    {
      points: photos.map((photo) => ({
        photoId: photo.id,
        albumId: photo.albumId,
        latitude: photo.exactLatitude,
        longitude: photo.exactLongitude,
        capturedAt: photo.capturedAt,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

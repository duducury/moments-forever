import { NextResponse } from "next/server";

import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Signed-in owner's place albums, for choosing where new photos go. */
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

  const result = await loadOwnerPlaceCards(supabase, user.id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    albums: (result.places ?? []).map((place) => ({
      albumId: place.albumId,
      experienceId: place.experienceId,
      experienceSlug: place.experienceSlug,
      experienceTitle: place.experienceTitle,
      title: place.title,
      coverPhotoId: place.coverPhotoId,
      countryCode: place.countryCode,
      photoCount: place.photoCount,
    })),
  });
}

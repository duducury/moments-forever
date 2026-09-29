import { NextResponse } from "next/server";

import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import { getUserLicense } from "@/lib/licensing/get-user-license";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function nfcUrl(token: string): string {
  return `${getSiteUrl()}/n/${token}`;
}

/**
 * All of the owner's trips + their NFC tag status, for the "Ativar NFC" list.
 * Sourced from the same root-album ("pasta") data /perfil shows, so the name
 * here always matches whatever the owner last renamed it to — never the
 * (possibly stale) experiences.title, which a rename never touches.
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

  // One root album per experience in the common case — dedupe defensively
  // so a trip never shows twice (an nfc_tags row is keyed by experience,
  // not by album).
  const seenExperienceIds = new Set<string>();
  const trips = places.filter((place) => {
    if (seenExperienceIds.has(place.experienceId)) return false;
    seenExperienceIds.add(place.experienceId);
    return true;
  });

  const experienceIds = trips.map((trip) => trip.experienceId);
  const tags =
    experienceIds.length > 0
      ? await supabase
          .from("nfc_tags")
          .select("trip_id, token")
          .eq("user_id", user.id)
          .in("trip_id", experienceIds)
      : { data: [] as Array<{ trip_id: string; token: string }> };

  const tokenByExperienceId = new Map(
    (tags.data ?? []).map((row) => [
      row.trip_id as string,
      row.token as string,
    ]),
  );

  return NextResponse.json({
    trips: trips.map((trip) => {
      const token = tokenByExperienceId.get(trip.experienceId) ?? null;
      return {
        experienceId: trip.experienceId,
        title: trip.title,
        countryCode: trip.countryCode,
        coverPhotoId: trip.coverPhotoId,
        photoCount: trip.photoCount,
        nfcToken: token,
        nfcUrl: token ? nfcUrl(token) : null,
      };
    }),
    usedCount: tokenByExperienceId.size,
    maxNfcTags: license?.maxNfcTags ?? null,
  });
}

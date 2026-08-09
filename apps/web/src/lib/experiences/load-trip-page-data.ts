/**
 * Shared Experience + albums + photos loader for the unified trip view.
 */

import {
  attachPhotoLocationLabels,
  loadTripAlbums,
} from "@/lib/location/trip-albums";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

import type {
  TripAlbum,
  TripExperience,
  TripPhoto,
} from "@/app/trip/[slug]/album-types";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

export type TripPageData = {
  readonly experience: TripExperience;
  readonly albums: readonly TripAlbum[];
  readonly photos: readonly TripPhoto[];
};

export async function loadTripPageData(
  supabase: ServerSupabase,
  slug: string,
): Promise<TripPageData | null> {
  const experienceResult = await supabase
    .from("experiences")
    .select(
      "id, owner_id, slug, title, description, starts_at, ends_at, primary_city, primary_country, cover_photo_id, status, visibility",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (experienceResult.error || !experienceResult.data) {
    return null;
  }

  const experienceRow = experienceResult.data;
  const [albums, photosResult] = await Promise.all([
    loadTripAlbums(supabase, experienceRow.id as string),
    supabase
      .from("photos")
      .select(
        "id, album_id, moment_id, position_in_album, position_in_moment, captured_at, width, height, exact_latitude, exact_longitude, storage_key",
      )
      .eq("experience_id", experienceRow.id as string)
      .order("position_in_album"),
  ]);

  const photos: TripPhoto[] = attachPhotoLocationLabels(
    (photosResult.data ?? []).map((photo) => ({
      id: photo.id as string,
      albumId: (photo.album_id as string | null) ?? null,
      momentId: photo.moment_id as string,
      positionInAlbum: (photo.position_in_album as number | null) ?? null,
      positionInMoment: photo.position_in_moment as number,
      capturedAt: (photo.captured_at as string | null) ?? null,
      width: (photo.width as number | null) ?? null,
      height: (photo.height as number | null) ?? null,
      exactLatitude: (photo.exact_latitude as number | null) ?? null,
      exactLongitude: (photo.exact_longitude as number | null) ?? null,
      locationLabel: null,
      hasPermanentStorage: Boolean(
        (photo.storage_key as string | null)?.trim(),
      ),
    })),
    albums,
  );

  return {
    experience: {
      id: experienceRow.id as string,
      ownerId: experienceRow.owner_id as string,
      slug: experienceRow.slug as string,
      title: experienceRow.title as string,
      description: (experienceRow.description as string | null) ?? null,
      startsAt: (experienceRow.starts_at as string | null) ?? null,
      endsAt: (experienceRow.ends_at as string | null) ?? null,
      primaryCity: (experienceRow.primary_city as string | null) ?? null,
      primaryCountry: (experienceRow.primary_country as string | null) ?? null,
      coverPhotoId: (experienceRow.cover_photo_id as string | null) ?? null,
      status: experienceRow.status as string,
    },
    albums,
    photos,
  };
}

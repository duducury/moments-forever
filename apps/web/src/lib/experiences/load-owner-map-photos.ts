/**
 * All GPS photos for an owner — profile-wide TripMap.
 * Same photo ids / IndexedDB keys as trip views.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";

import type { TripPhoto } from "@/app/trip/[slug]/album-types";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

export async function loadOwnerMapPhotos(
  supabase: ServerSupabase,
  ownerId: string,
): Promise<readonly TripPhoto[]> {
  const experiences = await supabase
    .from("experiences")
    .select("id, title, slug")
    .eq("owner_id", ownerId);

  if (experiences.error || !experiences.data?.length) {
    return [];
  }

  const metaById = new Map(
    experiences.data.map((row) => [
      row.id as string,
      {
        title: row.title as string,
        slug: row.slug as string,
      },
    ]),
  );
  const experienceIds = experiences.data.map((row) => row.id as string);

  const photos = await supabase
    .from("photos")
    .select(
      "id, experience_id, album_id, moment_id, position_in_album, position_in_moment, captured_at, width, height, exact_latitude, exact_longitude",
    )
    .in("experience_id", experienceIds)
    .not("exact_latitude", "is", null)
    .not("exact_longitude", "is", null);

  if (photos.error || !photos.data) {
    return [];
  }

  return photos.data
    .filter(
      (photo) =>
        Number.isFinite(photo.exact_latitude as number) &&
        Number.isFinite(photo.exact_longitude as number),
    )
    .map((photo) => {
      const meta = metaById.get(photo.experience_id as string);
      return {
        id: photo.id as string,
        albumId: (photo.album_id as string | null) ?? null,
        momentId: photo.moment_id as string,
        positionInAlbum: (photo.position_in_album as number | null) ?? null,
        positionInMoment: photo.position_in_moment as number,
        capturedAt: (photo.captured_at as string | null) ?? null,
        width: (photo.width as number | null) ?? null,
        height: (photo.height as number | null) ?? null,
        exactLatitude: photo.exact_latitude as number,
        exactLongitude: photo.exact_longitude as number,
        locationLabel: meta?.title ?? null,
        experienceSlug: meta?.slug ?? null,
      };
    });
}

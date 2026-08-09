/**
 * Random sample of owner photos for the profile Destaques carousel.
 * Picks across albums so refresh yields a new mix.
 */

import { connection } from "next/server";
import { resolveLocationDisplayName } from "@moments-forever/shared";

import type { TripPhoto } from "@/app/trip/[slug]/album-types";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

const MAX_CAROUSEL_PHOTOS = 36;

export type ProfileCarouselPhoto = TripPhoto & {
  readonly experienceSlug: string;
};

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = items[i] as T;
    items[i] = items[j] as T;
    items[j] = current;
  }
  return items;
}

/**
 * Take photos round-robin from each album (each album shuffled first),
 * then shuffle the final deck so neighbors aren't always same-folder.
 */
function sampleAcrossAlbums(
  photos: readonly ProfileCarouselPhoto[],
  max: number,
): ProfileCarouselPhoto[] {
  if (photos.length === 0) return [];

  const byAlbum = new Map<string, ProfileCarouselPhoto[]>();
  for (const photo of photos) {
    const key = photo.albumId ?? "__none__";
    const list = byAlbum.get(key);
    if (list) {
      list.push(photo);
    } else {
      byAlbum.set(key, [photo]);
    }
  }

  const queues = [...byAlbum.values()].map((list) => shuffleInPlace([...list]));
  shuffleInPlace(queues);

  const picked: ProfileCarouselPhoto[] = [];
  let madeProgress = true;
  while (picked.length < max && madeProgress) {
    madeProgress = false;
    for (const queue of queues) {
      if (picked.length >= max) break;
      const next = queue.shift();
      if (next) {
        picked.push(next);
        madeProgress = true;
      }
    }
  }

  return shuffleInPlace(picked);
}

export async function loadOwnerCarouselPhotos(
  supabase: ServerSupabase,
  ownerId: string,
): Promise<readonly ProfileCarouselPhoto[]> {
  // Opt out of static/RSC caching so Math.random() differs every refresh.
  await connection();

  const experiences = await supabase
    .from("experiences")
    .select("id, slug, title")
    .eq("owner_id", ownerId);

  if (experiences.error || !experiences.data?.length) {
    return [];
  }

  const experienceById = new Map(
    experiences.data.map((row) => [
      row.id as string,
      {
        slug: row.slug as string,
        title: row.title as string,
      },
    ]),
  );
  const experienceIds = experiences.data.map((row) => row.id as string);

  const albums = await supabase
    .from("albums")
    .select("id, name, source_moment_id")
    .in("experience_id", experienceIds);

  if (albums.error) {
    return [];
  }

  const albumRows = albums.data ?? [];
  const momentIds = [
    ...new Set(
      albumRows
        .map((album) => album.source_moment_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const placeNameByMomentId = new Map<
    string,
    { readonly name: string; readonly confirmed: boolean }
  >();
  if (momentIds.length > 0) {
    const moments = await supabase
      .from("moments")
      .select("id, place_id")
      .in("id", momentIds);
    const placeIds = [
      ...new Set(
        (moments.data ?? [])
          .map((moment) => moment.place_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const placesById = new Map<
      string,
      { readonly name: string; readonly confirmed: boolean }
    >();
    if (placeIds.length > 0) {
      const places = await supabase
        .from("places")
        .select("id, name, confirmed_by_user")
        .in("id", placeIds);
      for (const place of places.data ?? []) {
        placesById.set(place.id as string, {
          name: place.name as string,
          confirmed: Boolean(place.confirmed_by_user),
        });
      }
    }
    for (const moment of moments.data ?? []) {
      const placeId = moment.place_id as string | null;
      if (!placeId) continue;
      const place = placesById.get(placeId);
      if (place) {
        placeNameByMomentId.set(moment.id as string, place);
      }
    }
  }

  // Prefer the folder name the user chose (e.g. "dubai") over a stale
  // confirmed geocode place that can disagree with where the photo lives.
  const placeLabelByAlbumId = new Map<string, string>();
  for (const album of albumRows) {
    const momentId = album.source_moment_id as string | null;
    const linked = momentId ? placeNameByMomentId.get(momentId) : null;
    placeLabelByAlbumId.set(
      album.id as string,
      resolveLocationDisplayName({
        albumName: album.name as string,
        placeName: linked?.name ?? null,
        placeConfirmedByUser: false,
      }),
    );
  }

  const photos = await supabase
    .from("photos")
    .select(
      "id, experience_id, album_id, moment_id, position_in_album, position_in_moment, captured_at, width, height, exact_latitude, exact_longitude",
    )
    .in("experience_id", experienceIds);

  if (photos.error || !photos.data?.length) {
    return [];
  }

  const mapped: ProfileCarouselPhoto[] = [];
  for (const photo of photos.data) {
    const experience = experienceById.get(photo.experience_id as string);
    if (!experience?.slug) continue;
    const albumId = (photo.album_id as string | null) ?? null;
    const placeLabel = albumId
      ? (placeLabelByAlbumId.get(albumId) ?? experience.title)
      : experience.title;

    mapped.push({
      id: photo.id as string,
      albumId,
      momentId: photo.moment_id as string,
      positionInAlbum: (photo.position_in_album as number | null) ?? null,
      positionInMoment: photo.position_in_moment as number,
      capturedAt: (photo.captured_at as string | null) ?? null,
      width: (photo.width as number | null) ?? null,
      height: (photo.height as number | null) ?? null,
      exactLatitude: (photo.exact_latitude as number | null) ?? null,
      exactLongitude: (photo.exact_longitude as number | null) ?? null,
      locationLabel: placeLabel,
      experienceSlug: experience.slug,
    });
  }

  return sampleAcrossAlbums(mapped, MAX_CAROUSEL_PHOTOS);
}

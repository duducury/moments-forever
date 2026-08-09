import { resolveLocationDisplayName } from "@moments-forever/shared";

import type { TripAlbum, TripPhoto } from "@/app/trip/[slug]/album-types";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

type AlbumRow = {
  readonly id: string;
  readonly experience_id: string;
  readonly parent_album_id: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly cover_photo_id: string | null;
  readonly position: number;
  readonly source_moment_id: string | null;
};

type PlaceRow = {
  readonly id: string;
  readonly name: string;
  readonly confirmed_by_user: boolean;
};

/**
 * Loads albums for an experience and resolves display names from linked places.
 * Suggested real names come from `places.name` when geocoding fills them later;
 * until then, generic "Lugar N" / legacy "Local N" remains the fallback.
 */
export async function loadTripAlbums(
  supabase: ServerSupabase,
  experienceId: string,
): Promise<TripAlbum[]> {
  const albumsResult = await supabase
    .from("albums")
    .select(
      "id, experience_id, parent_album_id, name, description, cover_photo_id, position, source_moment_id",
    )
    .eq("experience_id", experienceId)
    .order("position");

  const rows = (albumsResult.data ?? []) as AlbumRow[];
  const momentIds = [
    ...new Set(
      rows
        .map((album) => album.source_moment_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const placeByMomentId = new Map<string, PlaceRow>();
  if (momentIds.length > 0) {
    const momentsResult = await supabase
      .from("moments")
      .select("id, place_id")
      .in("id", momentIds);

    const placeIds = [
      ...new Set(
        (momentsResult.data ?? [])
          .map((moment) => moment.place_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const placesById = new Map<string, PlaceRow>();
    if (placeIds.length > 0) {
      const placesResult = await supabase
        .from("places")
        .select("id, name, confirmed_by_user")
        .in("id", placeIds);
      for (const place of placesResult.data ?? []) {
        placesById.set(place.id, {
          id: place.id,
          name: place.name,
          confirmed_by_user: place.confirmed_by_user,
        });
      }
    }

    for (const moment of momentsResult.data ?? []) {
      const placeId = moment.place_id as string | null;
      if (!placeId) continue;
      const place = placesById.get(placeId);
      if (place) {
        placeByMomentId.set(moment.id as string, place);
      }
    }
  }

  return rows.map((album) => {
    const place = album.source_moment_id
      ? (placeByMomentId.get(album.source_moment_id) ?? null)
      : null;
    const placeName = place?.name ?? null;
    const placeConfirmedByUser = place?.confirmed_by_user ?? false;
    return {
      id: album.id,
      experienceId: album.experience_id,
      parentAlbumId: album.parent_album_id,
      name: album.name,
      displayName: resolveLocationDisplayName({
        albumName: album.name,
        placeName,
        placeConfirmedByUser,
        fallbackIndex: album.position,
      }),
      description: album.description,
      coverPhotoId: album.cover_photo_id,
      position: album.position,
      placeId: place?.id ?? null,
      placeName,
      placeConfirmedByUser,
    };
  });
}

export function attachPhotoLocationLabels(
  photos: readonly TripPhoto[],
  albums: readonly TripAlbum[],
): TripPhoto[] {
  const labelByAlbumId = new Map(
    albums.map((album) => [album.id, album.displayName] as const),
  );
  return photos.map((photo) => ({
    ...photo,
    locationLabel: photo.albumId
      ? (labelByAlbumId.get(photo.albumId) ?? null)
      : null,
  }));
}

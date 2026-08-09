/**
 * Assign photos to places (albums) inside an existing Experience.
 * Never creates a new Experience — only places/moments within the same trip.
 */

import {
  DEFAULT_PHOTO_GROUPING_CONFIG,
  isGenericLocationLabel,
} from "@moments-forever/shared";

import { distanceMeters } from "@/lib/map/cluster-photos";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

const MATCH_RADIUS_M = DEFAULT_PHOTO_GROUPING_CONFIG.locationRadiusKm * 1_000;

export interface AssignablePhoto {
  readonly id: string;
  readonly exact_latitude?: number | null;
  readonly exact_longitude?: number | null;
}

interface PlaceAlbumLink {
  readonly placeId: string;
  readonly albumId: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

function hasGps(
  photo: AssignablePhoto,
): photo is AssignablePhoto & {
  readonly exact_latitude: number;
  readonly exact_longitude: number;
} {
  return (
    typeof photo.exact_latitude === "number" &&
    typeof photo.exact_longitude === "number" &&
    Number.isFinite(photo.exact_latitude) &&
    Number.isFinite(photo.exact_longitude)
  );
}

async function loadPlaceAlbumLinks(
  supabase: ServerSupabase,
  experienceId: string,
): Promise<PlaceAlbumLink[]> {
  const placesResult = await supabase
    .from("places")
    .select("id, name, exact_latitude, exact_longitude")
    .eq("experience_id", experienceId)
    .not("exact_latitude", "is", null)
    .not("exact_longitude", "is", null);

  if (placesResult.error || !placesResult.data) {
    return [];
  }

  const links: PlaceAlbumLink[] = [];
  for (const place of placesResult.data) {
    const lat = place.exact_latitude as number | null;
    const lng = place.exact_longitude as number | null;
    if (
      lat === null ||
      lng === null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      continue;
    }

    const moment = await supabase
      .from("moments")
      .select("id")
      .eq("experience_id", experienceId)
      .eq("place_id", place.id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!moment.data?.id) continue;

    const album = await supabase
      .from("albums")
      .select("id")
      .eq("experience_id", experienceId)
      .eq("source_moment_id", moment.data.id)
      .maybeSingle();

    if (!album.data?.id) continue;

    links.push({
      placeId: place.id as string,
      albumId: album.data.id as string,
      name: place.name as string,
      latitude: lat,
      longitude: lng,
    });
  }

  return links;
}

function nearestPlace(
  latitude: number,
  longitude: number,
  places: readonly PlaceAlbumLink[],
): PlaceAlbumLink | null {
  let best: PlaceAlbumLink | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const place of places) {
    const distance = distanceMeters(
      latitude,
      longitude,
      place.latitude,
      place.longitude,
    );
    if (distance <= MATCH_RADIUS_M && distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}

/** Simple greedy clustering for unmatched GPS photos (same radius as import). */
function clusterUnmatched(
  photos: readonly (AssignablePhoto & {
    readonly exact_latitude: number;
    readonly exact_longitude: number;
  })[],
): readonly {
  readonly latitude: number;
  readonly longitude: number;
  readonly photoIds: readonly string[];
}[] {
  const remaining = [...photos];
  const clusters: {
    latitude: number;
    longitude: number;
    photoIds: string[];
  }[] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift();
    if (!seed) break;
    const members = [seed];
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index];
      if (!candidate) continue;
      if (
        distanceMeters(
          seed.exact_latitude,
          seed.exact_longitude,
          candidate.exact_latitude,
          candidate.exact_longitude,
        ) <= MATCH_RADIUS_M
      ) {
        members.push(candidate);
        remaining.splice(index, 1);
      }
    }
    const latitude =
      members.reduce((sum, photo) => sum + photo.exact_latitude, 0) /
      members.length;
    const longitude =
      members.reduce((sum, photo) => sum + photo.exact_longitude, 0) /
      members.length;
    clusters.push({
      latitude,
      longitude,
      photoIds: members.map((photo) => photo.id),
    });
  }

  return clusters;
}

async function nextGenericPlaceIndex(
  supabase: ServerSupabase,
  experienceId: string,
): Promise<number> {
  const places = await supabase
    .from("places")
    .select("name")
    .eq("experience_id", experienceId);
  let max = 0;
  for (const place of places.data ?? []) {
    const name = String(place.name ?? "");
    const match = /^(?:local|lugar)\s+(\d+)$/iu.exec(name.trim());
    if (match?.[1]) {
      max = Math.max(max, Number(match[1]));
    }
  }
  const albums = await supabase
    .from("albums")
    .select("name")
    .eq("experience_id", experienceId)
    .is("parent_album_id", null);
  for (const album of albums.data ?? []) {
    const name = String(album.name ?? "");
    if (!isGenericLocationLabel(name)) continue;
    const match = /^(?:local|lugar)\s+(\d+)$/iu.exec(name.trim());
    if (match?.[1]) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

async function createPlaceWithAlbum(
  supabase: ServerSupabase,
  experienceId: string,
  latitude: number,
  longitude: number,
  placeIndex: number,
): Promise<{ readonly albumId: string } | { readonly error: string }> {
  const name = `Lugar ${placeIndex}`;

  const placeInsert = await supabase
    .from("places")
    .insert({
      experience_id: experienceId,
      name,
      exact_latitude: latitude,
      exact_longitude: longitude,
      location_source: "gps",
      confirmed_by_user: false,
    })
    .select("id")
    .single();

  if (placeInsert.error || !placeInsert.data) {
    return {
      error: placeInsert.error?.message ?? "Falha ao criar lugar.",
    };
  }

  const maxMoment = await supabase
    .from("moments")
    .select("position")
    .eq("experience_id", experienceId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (maxMoment.data?.[0]?.position ?? 0) + 1;
  const momentInsert = await supabase
    .from("moments")
    .insert({
      experience_id: experienceId,
      place_id: placeInsert.data.id,
      title: name,
      position: nextPosition,
      confirmed_by_user: true,
    })
    .select("id")
    .single();

  if (momentInsert.error || !momentInsert.data) {
    return {
      error: momentInsert.error?.message ?? "Falha ao criar momento do lugar.",
    };
  }

  // Trigger creates root album with source_moment_id.
  const album = await supabase
    .from("albums")
    .select("id")
    .eq("experience_id", experienceId)
    .eq("source_moment_id", momentInsert.data.id)
    .maybeSingle();

  if (!album.data?.id) {
    return { error: "Álbum do novo lugar não foi criado." };
  }

  return { albumId: album.data.id as string };
}

/**
 * Resolve album_id for each photo inside one experience.
 * - GPS near an existing place → that place's album
 * - GPS unmatched → create new place(s) in the same experience
 * - No GPS → fallbackAlbumId
 */
export async function assignPhotosToAlbumsInExperience(
  supabase: ServerSupabase,
  experienceId: string,
  photos: readonly AssignablePhoto[],
  fallbackAlbumId: string,
): Promise<
  | { readonly albumByPhotoId: ReadonlyMap<string, string> }
  | { readonly error: string }
> {
  const albumByPhotoId = new Map<string, string>();
  const places = await loadPlaceAlbumLinks(supabase, experienceId);
  const workingPlaces = [...places];

  const withGps = photos.filter(hasGps);
  const withoutGps = photos.filter((photo) => !hasGps(photo));

  for (const photo of withoutGps) {
    albumByPhotoId.set(photo.id, fallbackAlbumId);
  }

  const unmatched: Array<
    AssignablePhoto & {
      readonly exact_latitude: number;
      readonly exact_longitude: number;
    }
  > = [];

  for (const photo of withGps) {
    const match = nearestPlace(
      photo.exact_latitude,
      photo.exact_longitude,
      workingPlaces,
    );
    if (match) {
      albumByPhotoId.set(photo.id, match.albumId);
    } else {
      unmatched.push(photo);
    }
  }

  if (unmatched.length > 0) {
    let nextIndex = await nextGenericPlaceIndex(supabase, experienceId);
    const clusters = clusterUnmatched(unmatched);
    for (const cluster of clusters) {
      const created = await createPlaceWithAlbum(
        supabase,
        experienceId,
        cluster.latitude,
        cluster.longitude,
        nextIndex,
      );
      if ("error" in created) {
        return { error: created.error };
      }
      workingPlaces.push({
        placeId: "",
        albumId: created.albumId,
        name: `Lugar ${nextIndex}`,
        latitude: cluster.latitude,
        longitude: cluster.longitude,
      });
      for (const photoId of cluster.photoIds) {
        albumByPhotoId.set(photoId, created.albumId);
      }
      nextIndex += 1;
    }
  }

  return { albumByPhotoId };
}

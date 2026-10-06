/**
 * Server-side shaping of what Moments Forever already holds, for comparing with
 * the phone library. Pure functions over rows already loaded by the API route.
 */

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";

import { centroid, distanceKm, validGeo } from "./geo";
import type {
  ExistingTrip,
  GeoPoint,
  KnownAsset,
  LegacyPhoto,
} from "./types";

export interface AlbumRow {
  readonly id: string;
  readonly experience_id: string;
  readonly parent_album_id: string | null;
}

export interface PhotoRow {
  readonly experience_id: string;
  readonly album_id: string | null;
  readonly captured_at: string | null;
  readonly exact_latitude: number | null;
  readonly exact_longitude: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly source_asset_id: string | null;
}

/** A photo can sit in a sub-album; the profile card is the root album. */
export function rootAlbumResolver(albums: readonly AlbumRow[]) {
  const parentOf = new Map(albums.map((album) => [album.id, album.parent_album_id] as const));
  return (albumId: string | null): string | null => {
    if (!albumId) return null;
    let current: string = albumId;
    for (let guard = 0; guard < 16; guard += 1) {
      const parent = parentOf.get(current);
      if (!parent) return current;
      current = parent;
    }
    return current;
  };
}

export function buildExistingTrips(input: {
  readonly cards: readonly OwnerPlaceCardItem[];
  readonly albums: readonly AlbumRow[];
  readonly photos: readonly PhotoRow[];
}): ExistingTrip[] {
  const rootOf = rootAlbumResolver(input.albums);
  const pointsByRoot = new Map<string, GeoPoint[]>();
  for (const photo of input.photos) {
    const root = rootOf(photo.album_id);
    const point = validGeo(photo.exact_latitude, photo.exact_longitude);
    if (!root || !point) continue;
    const list = pointsByRoot.get(root) ?? [];
    list.push(point);
    pointsByRoot.set(root, list);
  }

  return input.cards.map((card) => {
    const points = pointsByRoot.get(card.albumId) ?? [];
    const center = centroid(points);
    const radiusKm = center
      ? Math.max(...points.map((point) => distanceKm(point, center)))
      : null;
    return {
      albumId: card.albumId,
      experienceId: card.experienceId,
      experienceSlug: card.experienceSlug,
      title: card.title,
      countryCode: card.countryCode,
      startsAt: card.startsAt,
      endsAt: card.endsAt,
      photoCount: card.photoCount,
      center,
      radiusKm,
    };
  });
}

export function buildKnownAssets(
  photos: readonly PhotoRow[],
  albums: readonly AlbumRow[],
): KnownAsset[] {
  const rootOf = rootAlbumResolver(albums);
  const result: KnownAsset[] = [];
  for (const photo of photos) {
    if (!photo.source_asset_id) continue;
    result.push({
      assetId: photo.source_asset_id,
      experienceId: photo.experience_id,
      albumId: rootOf(photo.album_id),
    });
  }
  return result;
}

/** Photos from before source_asset_id, only for the experiences being compared. */
export function buildLegacyPhotos(
  photos: readonly PhotoRow[],
  experienceIds: ReadonlySet<string>,
): (LegacyPhoto & { readonly experienceId: string })[] {
  const result: (LegacyPhoto & { readonly experienceId: string })[] = [];
  for (const photo of photos) {
    if (photo.source_asset_id || !experienceIds.has(photo.experience_id)) continue;
    if (!photo.captured_at) continue;
    result.push({
      experienceId: photo.experience_id,
      capturedAt: photo.captured_at,
      latitude: photo.exact_latitude,
      longitude: photo.exact_longitude,
      width: photo.width,
      height: photo.height,
    });
  }
  return result;
}

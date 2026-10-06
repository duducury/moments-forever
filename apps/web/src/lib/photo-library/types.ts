/**
 * Shared shapes for "Encontrar viagem / Encontrar fotos".
 * Everything about the phone library stays on the device; only what the user
 * explicitly selects ever reaches the upload pipeline.
 */

import type { NativePlatform } from "./source-asset-id";

/** Metadata of one library photo as reported by the native plugin (no pixels). */
export interface LibraryAsset {
  readonly platform: NativePlatform;
  /** PHAsset.localIdentifier / MediaStore _ID — what the plugin needs to export it. */
  readonly nativeId: string;
  /** ISO-8601 UTC capture time, null when the photo has none. */
  readonly takenAt: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly width: number;
  readonly height: number;
}

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * How much GPS backs a discovered trip:
 *  - "located": 3+ geotagged photos far from home — named by place, matched by place;
 *  - "limited": 1–2 geotagged photos plus photos without GPS — a possible trip, location NOT trusted;
 *  - "none":    no GPS at all, found only by the burst of photos over several days.
 */
export type LocationQuality = "located" | "limited" | "none";

/** A place the trip passed through (≈15 km cluster), used to name it ("New York → Boston"). */
export interface TripStop {
  /** Stable within one scan; the key for its place name. */
  readonly id: string;
  readonly center: GeoPoint;
  readonly photoCount: number;
  /** First day (YYYY-MM-DD) there — orders the stops. */
  readonly firstDay: string;
}

/** A trip found in the library by looking at dates and places. Not created anywhere yet. */
export interface DiscoveredTrip {
  /** Stable within one scan: derived from the first photo. */
  readonly id: string;
  readonly startDate: string; // YYYY-MM-DD (UTC)
  readonly endDate: string;
  readonly center: GeoPoint | null;
  /** Largest distance of a geotagged photo from `center`, in km. */
  readonly radiusKm: number;
  /** Everything that belongs to this trip, newest first. */
  readonly assets: readonly LibraryAsset[];
  /** How many of those have no GPS (placed by date only). */
  readonly withoutLocationCount: number;
  /**
   * The most representative places, in the order they were visited (at most 3).
   * Empty when the trip has no usable GPS — then it is never given a place name.
   */
  readonly stops: readonly TripStop[];
  readonly locationQuality: LocationQuality;
}

/** A root album ("viagem" card on the profile) that already exists in Moments Forever. */
export interface ExistingTrip {
  readonly albumId: string;
  readonly experienceId: string;
  readonly experienceSlug: string;
  readonly title: string;
  readonly countryCode: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly photoCount: number;
  readonly center: GeoPoint | null;
  /** Spread of its geotagged photos, in km (null without GPS). */
  readonly radiusKm: number | null;
}

/** Library photo already stored in Moments Forever (photos.source_asset_id). */
export interface KnownAsset {
  readonly assetId: string;
  readonly experienceId: string;
  readonly albumId: string | null;
}

/** Photo stored before source_asset_id existed: only date and place can tell it apart. */
export interface LegacyPhoto {
  readonly capturedAt: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** Shape of the stored copy (it is resized, so only the ratio is comparable). */
  readonly width: number | null;
  readonly height: number | null;
}

export interface PhotoLibraryContext {
  readonly trips: readonly ExistingTrip[];
  readonly knownAssets: readonly KnownAsset[];
  /** Only for the experiences asked for (`experienceIds`), to keep the payload small. */
  readonly legacyPhotos: readonly (LegacyPhoto & { readonly experienceId: string })[];
}

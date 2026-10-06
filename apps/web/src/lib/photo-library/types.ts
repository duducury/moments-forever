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

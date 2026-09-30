import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";

export interface OwnerNfcTripView {
  readonly experienceId: string;
  readonly albumId: string;
  readonly title: string;
  readonly countryCode: string | null;
  readonly coverPhotoId: string | null;
  readonly photoCount: number;
  readonly nfcToken: string | null;
  readonly nfcUrl: string | null;
}

/**
 * Builds the "Ativar NFC" list: one row per root album (destination card) —
 * never deduplicated by experience. An experience can have several root
 * albums ("Dubai" and "Bali" under one import trip), and each is
 * independently taggable, so each needs its own row and its own tag lookup
 * keyed by albumId. Mixing up which album a token belongs to here is exactly
 * the class of bug that made a "Dubai" tag open "Bali".
 */
export function shapeOwnerNfcTrips(
  places: readonly OwnerPlaceCardItem[],
  tokenByAlbumId: ReadonlyMap<string, string>,
  urlForToken: (token: string) => string,
): readonly OwnerNfcTripView[] {
  return places.map((place) => {
    const token = tokenByAlbumId.get(place.albumId) ?? null;
    return {
      experienceId: place.experienceId,
      albumId: place.albumId,
      title: place.title,
      countryCode: place.countryCode,
      coverPhotoId: place.coverPhotoId,
      photoCount: place.photoCount,
      nfcToken: token,
      nfcUrl: token ? urlForToken(token) : null,
    };
  });
}

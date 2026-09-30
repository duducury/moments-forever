/**
 * Pure rules for the "Vincular NFC" action inside an album/destination
 * folder — kept separate from the client component so they're unit-testable
 * without a DOM.
 */

/**
 * "Vincular NFC" only ever appears for the authenticated owner, and only on
 * a root album (destination): `nfc_tags.album_id` requires a root album, so
 * a subálbum could never actually be linked even if the button were shown.
 */
export function canShowVincularNfcAction({
  isOwner,
  parentAlbumId,
}: {
  readonly isOwner: boolean;
  readonly parentAlbumId: string | null;
}): boolean {
  return isOwner && parentAlbumId === null;
}

/**
 * The exact (experienceId, albumId) pair to send to /api/nfc-tags. albumId
 * is always the album actually open on screen — never inferred from the
 * experience — so two root albums of the same experience (e.g. "Dubai" and
 * "Bali") always address their own, independent tag.
 */
export function buildNfcTagRequestBody({
  experienceId,
  albumId,
}: {
  readonly experienceId: string;
  readonly albumId: string;
}): { readonly experienceId: string; readonly albumId: string } {
  return { experienceId, albumId };
}

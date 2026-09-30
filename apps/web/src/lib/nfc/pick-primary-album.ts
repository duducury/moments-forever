export interface RootAlbumOrdering {
  readonly id: string;
  readonly position: number;
}

/**
 * The "which album does this experience's tag mean" fallback for callers
 * that only know an experienceId (the /perfil "Editar viagem" NFC tab has no
 * album picker — it always meant "this trip's primary destination"). Lowest
 * `position` wins, matching exactly what the pre-migration /n/[token] page
 * used to do — so a caller that never picks an album keeps getting the same
 * album it always got.
 */
export function pickPrimaryAlbumId(
  rootAlbums: readonly RootAlbumOrdering[],
): string | null {
  if (rootAlbums.length === 0) return null;
  return [...rootAlbums].sort((a, b) => a.position - b.position)[0]!.id;
}

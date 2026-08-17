/** Adjacent lightbox ids without wrapping. First has no previous; last has no next. */
export function lightboxNeighborIds(
  photoIds: readonly string[],
  index: number,
): readonly [string | null, string | null, string | null, string | null] {
  if (photoIds.length < 2 || index < 0 || index >= photoIds.length) {
    return [null, null, null, null];
  }

  const at = (offset: number): string | null => {
    const next = index + offset;
    if (next < 0 || next >= photoIds.length) return null;
    return photoIds[next] ?? null;
  };

  return [at(-2), at(-1), at(1), at(2)];
}

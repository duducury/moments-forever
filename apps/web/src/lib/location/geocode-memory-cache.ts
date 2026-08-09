/**
 * Process-local reverse-geocode cache (no DB migration).
 *
 * Nominatim policy requires aggressive caching. Results are also persisted into
 * `places.name` after a successful lookup; this Map avoids repeat HTTP calls
 * within the same Node process for the same rounded coordinates.
 */

const memory = new Map<string, string | null>();

export function getCachedGeocodeLabel(key: string): string | null | undefined {
  if (!memory.has(key)) return undefined;
  return memory.get(key) ?? null;
}

export function setCachedGeocodeLabel(
  key: string,
  label: string | null,
): void {
  memory.set(key, label);
}

/** Test helper — clears process cache. */
export function clearGeocodeMemoryCache(): void {
  memory.clear();
}

export function geocodeMemoryCacheSize(): number {
  return memory.size;
}

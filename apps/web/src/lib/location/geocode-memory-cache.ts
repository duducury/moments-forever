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

const countryMemory = new Map<string, string | null>();

/** ISO alpha-2 the geocoder reported for the same rounded coordinates. */
export function getCachedGeocodeCountry(
  key: string,
): string | null | undefined {
  if (!countryMemory.has(key)) return undefined;
  return countryMemory.get(key) ?? null;
}

export function setCachedGeocodeCountry(
  key: string,
  countryCode: string | null,
): void {
  countryMemory.set(key, countryCode);
}

/** Test helper — clears process cache. */
export function clearGeocodeMemoryCache(): void {
  memory.clear();
  countryMemory.clear();
}

export function geocodeMemoryCacheSize(): number {
  return memory.size;
}

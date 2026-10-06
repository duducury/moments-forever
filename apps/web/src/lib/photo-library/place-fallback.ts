/**
 * Offline place names, used only when the reverse geocoder gave no answer
 * (offline, rate-limited, or a spot with no named place). Reuses the city list
 * already shipped for the globe (`public/geo/places-v1.json`, Portuguese names).
 * It names the nearest listed city only when that city is genuinely close — it
 * never guesses for a spot far from any of them.
 */

import { distanceKm } from "./geo";
import type { GeoPoint } from "./types";

export interface KnownCity {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

/** A listed city this close can fairly be said to be "where the photos were taken". */
export const FALLBACK_MAX_KM = 40;

interface GeoFeature {
  readonly properties?: { readonly k?: string; readonly n?: string };
  readonly geometry?: { readonly coordinates?: readonly number[] };
}

export function parseKnownCities(json: unknown): KnownCity[] {
  const features = (json as { features?: GeoFeature[] } | null)?.features ?? [];
  const cities: KnownCity[] = [];
  for (const feature of features) {
    if (feature.properties?.k !== "city") continue;
    const name = feature.properties.n;
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    if (
      typeof name === "string" &&
      typeof latitude === "number" &&
      typeof longitude === "number"
    ) {
      cities.push({ name, latitude, longitude });
    }
  }
  return cities;
}

export function nearestKnownCity(
  point: GeoPoint,
  cities: readonly KnownCity[],
  maxKm: number = FALLBACK_MAX_KM,
): KnownCity | null {
  let best: KnownCity | null = null;
  let bestKm = maxKm;
  for (const city of cities) {
    const km = distanceKm(point, city);
    if (km <= bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

let cached: Promise<KnownCity[]> | null = null;

/** Loads the shipped city list once. Never throws: no list just means no fallback. */
export function loadKnownCities(
  fetchImpl: typeof fetch = fetch,
): Promise<KnownCity[]> {
  cached ??= fetchImpl("/geo/places-v1.json")
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => parseKnownCities(json))
    .catch(() => []);
  return cached;
}

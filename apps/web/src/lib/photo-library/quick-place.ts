/**
 * An instant, offline answer to "where was this trip?" — "CT, USA", "Itália" —
 * so a trip card never waits for the reverse geocoder to say where it happened.
 * The city name still arrives later and, when it does, it takes over as the title.
 *
 * Data: `public/geo/admin-v1.json` (built by scripts/build-admin-geo.mjs): simplified
 * country and US-state outlines. Good enough to say which country / state a coordinate
 * is in; never used to draw anything. Outside the US only the country is said: a region
 * guessed from the nearest centroid would sometimes be the wrong region.
 */

import { nearestKnownCity, type KnownCity } from "./place-fallback";
import type { GeoPoint } from "./types";

type Rings = readonly (readonly number[])[];
interface Area {
  readonly c?: string;
  readonly a?: string;
  readonly n?: string;
  /** [minLon, minLat, maxLon, maxLat] × 100. */
  readonly b: readonly number[];
  /** Polygons → rings → flat [lon, lat, …] × 100. */
  readonly p: readonly Rings[];
}

export interface AdminGeo {
  readonly countries: readonly Area[];
  readonly us: readonly Area[];
}

export interface QuickPlace {
  /** "CT, USA" · "Itália" · "Portugal" */
  readonly label: string;
  readonly countryCode: string;
  /**
   * A listed city that really is where the photos were taken ("Nova Iorque"), when one is close
   * AND in the same state/country; null otherwise. A good first title that the slower
   * reverse geocoder never has to replace.
   */
  readonly city?: string | null;
}

/** A listed city this close can fairly be said to be "where the photos were taken". */
export const QUICK_CITY_MAX_KM = 25;

/** A coast photo can fall just outside a simplified outline: still this close counts as inside. */
const NEAR_DEGREES = 0.2;

function insideRing(ring: readonly number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i] as number;
    const yi = ring[i + 1] as number;
    const xj = ring[j] as number;
    const yj = ring[j + 1] as number;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideArea(area: Area, x: number, y: number): boolean {
  const [minX, minY, maxX, maxY] = area.b as [number, number, number, number];
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  return area.p.some(
    (rings) =>
      insideRing(rings[0] as readonly number[], x, y) &&
      !rings.slice(1).some((hole) => insideRing(hole, x, y)),
  );
}

/** Distance (in degrees ×100) from a point to the outer rings of an area. */
function edgeDistance(area: Area, x: number, y: number): number {
  let best = Infinity;
  for (const rings of area.p) {
    const ring = rings[0] as readonly number[];
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ax = ring[j] as number;
      const ay = ring[j + 1] as number;
      const bx = ring[i] as number;
      const by = ring[i + 1] as number;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
  }
  return best;
}

function areaAt(areas: readonly Area[], x: number, y: number): Area | null {
  for (const area of areas) if (insideArea(area, x, y)) return area;
  const margin = NEAR_DEGREES * 100;
  let best: Area | null = null;
  let bestDistance = margin;
  for (const area of areas) {
    const [minX, minY, maxX, maxY] = area.b as [number, number, number, number];
    if (x < minX - margin || x > maxX + margin || y < minY - margin || y > maxY + margin) continue;
    const distance = edgeDistance(area, x, y);
    if (distance <= bestDistance) {
      best = area;
      bestDistance = distance;
    }
  }
  return best;
}

function placeAt(point: GeoPoint, geo: AdminGeo): Omit<QuickPlace, "city"> | null {
  const x = Math.round(point.longitude * 100);
  const y = Math.round(point.latitude * 100);
  const country = areaAt(geo.countries, x, y);
  if (!country?.c) return null;

  if (country.c === "US") {
    const state = areaAt(geo.us, x, y);
    return { label: state?.a ? `${state.a}, USA` : "USA", countryCode: "US" };
  }

  return { label: country.n ?? country.c, countryCode: country.c };
}

/**
 * Country (and US state) of a coordinate, or null in the open sea. With the shipped city list,
 * also the city — only when that city sits in the same state/country as the point (a spot in
 * Hoboken, NJ is not "Nova Iorque").
 */
export function quickPlace(
  point: GeoPoint,
  geo: AdminGeo,
  cities?: readonly KnownCity[],
): QuickPlace | null {
  const base = placeAt(point, geo);
  if (!base) return null;
  let city: string | null = null;
  if (cities && cities.length > 0) {
    const near = nearestKnownCity(point, cities, QUICK_CITY_MAX_KM);
    if (near && placeAt(near, geo)?.label === base.label) city = near.name;
  }
  return { ...base, city };
}

let cached: Promise<AdminGeo | null> | null = null;

/** Loads the shipped outlines once. Never throws: no data just means no quick label. */
export function loadAdminGeo(fetchImpl: typeof fetch = fetch): Promise<AdminGeo | null> {
  cached ??= fetchImpl("/geo/admin-v1.json")
    .then((response) => (response.ok ? (response.json() as Promise<AdminGeo>) : null))
    .catch(() => null);
  return cached;
}

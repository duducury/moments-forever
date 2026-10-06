import { geographicDistanceKm } from "@moments-forever/shared";

import type { GeoPoint } from "./types";

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  return geographicDistanceKm(a, b);
}

/** UTC calendar day of an ISO timestamp, or null. */
export function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/** Whole days from `a` to `b` (both YYYY-MM-DD); negative when b is earlier. */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Plain centroid — fine at trip scale (hundreds of km), not across the antimeridian. */
export function centroid(points: readonly GeoPoint[]): GeoPoint | null {
  if (points.length === 0) return null;
  let lat = 0;
  let lon = 0;
  for (const point of points) {
    lat += point.latitude;
    lon += point.longitude;
  }
  return { latitude: lat / points.length, longitude: lon / points.length };
}

export function validGeo(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): GeoPoint | null {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  // (0,0) is the classic "no fix" value written by some cameras.
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

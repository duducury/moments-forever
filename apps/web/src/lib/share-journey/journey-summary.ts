/**
 * "Compartilhe sua jornada": pure data logic for the Instagram-story summary.
 * Everything here is derived from the owner's real trips (profile place cards)
 * and GPS photos — no fixtures, no hard-coded names or numbers.
 */

import { countryNameFromCode } from "@moments-forever/shared";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
import { buildPassport } from "@/lib/passport/build-passport";

/** The summary shows at most this many favourite trips. */
export const MAX_FAVORITE_TRIPS = 5;

/** Adds or removes `albumId`; never lets the selection exceed `max`. */
export function toggleTripSelection(
  selected: readonly string[],
  albumId: string,
  max: number = MAX_FAVORITE_TRIPS,
): string[] {
  if (selected.includes(albumId)) return selected.filter((id) => id !== albumId);
  if (selected.length >= max) return [...selected];
  return [...selected, albumId];
}

export function selectionCounterLabel(count: number, max: number = MAX_FAVORITE_TRIPS): string {
  return `${count} de ${max} selecionadas`;
}

export interface JourneyStats {
  readonly trips: number;
  readonly countries: number;
  readonly cities: number;
  readonly photos: number;
}

/** Same numbers the profile and the passport show. */
export function journeyStats(places: readonly OwnerPlaceCardItem[]): JourneyStats {
  const passport = buildPassport(places, null);
  return {
    trips: passport.tripCount,
    countries: passport.countryCount,
    cities: passport.cityCount,
    photos: passport.photoCount,
  };
}

function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  const year = new Date(iso).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

/** "2019 - 2026" (or one year) from every dated trip; null when no trip has a date. */
export function journeyPeriodLabel(places: readonly OwnerPlaceCardItem[]): string | null {
  const years: number[] = [];
  for (const place of places) {
    for (const iso of [place.startsAt, place.endsAt]) {
      const year = yearOf(iso);
      if (year !== null) years.push(year);
    }
  }
  if (years.length === 0) return null;
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first} - ${last}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

function parts(iso: string): { d: number; m: number; y: number } | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  return { d: date.getUTCDate(), m: date.getUTCMonth(), y: date.getUTCFullYear() };
}

/** "26 jul – 4 ago 2026", "31 jan 2020", "30 dez 2025 – 27 jan 2026"; null without dates. */
export function formatTripDates(startsAt: string | null, endsAt: string | null): string | null {
  const a = startsAt ? parts(startsAt) : null;
  const b = endsAt ? parts(endsAt) : null;
  const start = a ?? b;
  const end = b ?? a;
  if (!start || !end) return null;
  const one = (p: { d: number; m: number }) => `${p.d} ${MONTHS[p.m]}`;
  if (start.y === end.y && start.m === end.m && start.d === end.d) {
    return `${one(start)} ${start.y}`;
  }
  if (start.y === end.y) return `${one(start)} – ${one(end)} ${end.y}`;
  return `${one(start)} ${start.y} – ${one(end)} ${end.y}`;
}

export interface FavoriteTrip {
  readonly albumId: string;
  readonly name: string;
  readonly countryCode: string | null;
  readonly countryName: string | null;
  readonly dates: string | null;
  readonly coverPhotoId: string | null;
}

/** "<Cidade>, <País>" → "<Cidade>". */
export function tripDisplayName(title: string): string {
  const first = title.split(",")[0]?.trim();
  return first || title.trim();
}

/**
 * The trips the person picked, in the order they picked them, capped at 5.
 * Unknown ids are ignored; nothing is added to fill the free slots.
 */
export function selectFavoriteTrips(
  places: readonly OwnerPlaceCardItem[],
  selectedAlbumIds: readonly string[],
  max: number = MAX_FAVORITE_TRIPS,
): FavoriteTrip[] {
  const byId = new Map(places.map((place) => [place.albumId, place]));
  const seen = new Set<string>();
  const out: FavoriteTrip[] = [];
  for (const id of selectedAlbumIds) {
    const place = byId.get(id);
    if (!place || seen.has(id) || out.length >= max) continue;
    seen.add(id);
    const code = place.countryCode?.trim().toUpperCase() || null;
    out.push({
      albumId: place.albumId,
      name: tripDisplayName(place.title),
      countryCode: code,
      countryName: code ? countryNameFromCode(code) : null,
      dates: formatTripDates(place.startsAt, place.endsAt),
      coverPhotoId: place.coverPhotoId,
    });
  }
  return out;
}

/** One GPS photo of the owner, as returned by /api/me/journey-points. */
export interface JourneyPoint {
  readonly photoId: string;
  readonly albumId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly capturedAt: string | null;
}

export interface JourneyCluster {
  readonly latitude: number;
  readonly longitude: number;
  readonly count: number;
  /** A real photo of the cluster (used as the pin picture). */
  readonly photoId: string;
  /** Earliest capture time, ISO, for ordering the route. */
  readonly firstAt: string | null;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Photos closer than this to a place's centre belong to that place (one city / metro area). */
export const PLACE_RADIUS_KM = 60;

/**
 * Groups GPS photos into places by REAL distance: a photo joins the nearest
 * place within `radiusKm` of its centre, otherwise it starts a new place. Two
 * different cities or states never merge just because a grid cell contains
 * both. Biggest places first.
 */
export function clusterJourneyPoints(
  points: readonly JourneyPoint[],
  radiusKm: number = PLACE_RADIUS_KM,
): JourneyCluster[] {
  type Acc = { lat: number; lon: number; members: JourneyPoint[] };
  const places: Acc[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
    if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) continue;
    let best: Acc | null = null;
    let bestDistance = radiusKm;
    for (const place of places) {
      const d = haversineKm(point.latitude, point.longitude, place.lat, place.lon);
      if (d <= bestDistance) {
        best = place;
        bestDistance = d;
      }
    }
    if (best) {
      best.members.push(point);
      const n = best.members.length;
      best.lat += (point.latitude - best.lat) / n;
      best.lon += (point.longitude - best.lon) / n;
    } else {
      places.push({ lat: point.latitude, lon: point.longitude, members: [point] });
    }
  }
  return places
    .map((place) => {
      const dated = place.members
        .map((m) => m.capturedAt)
        .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value as string)))
        .sort();
      return {
        latitude: place.lat,
        longitude: place.lon,
        count: place.members.length,
        photoId: place.members[0]!.photoId,
        firstAt: dated[0] ?? null,
      };
    })
    .sort((x, y) => y.count - x.count);
}

export interface JourneySummary {
  readonly displayName: string;
  readonly bio: string | null;
  readonly countryCodes: readonly string[];
  readonly period: string | null;
  readonly stats: JourneyStats;
  readonly favorites: readonly FavoriteTrip[];
  /** EVERY place with GPS photos — the map. Independent of the favourite trips. */
  readonly clusters: readonly JourneyCluster[];
  /** How many GPS photos fed the map. */
  readonly gpsPhotoCount: number;
}

export function buildJourneySummary(input: {
  readonly places: readonly OwnerPlaceCardItem[];
  readonly displayName: string;
  readonly bio: string | null;
  readonly countryCodes: readonly string[];
  readonly selectedAlbumIds: readonly string[];
  readonly points: readonly JourneyPoint[];
}): JourneySummary {
  return {
    displayName: input.displayName,
    bio: input.bio?.trim() || null,
    countryCodes: input.countryCodes,
    period: journeyPeriodLabel(input.places),
    stats: journeyStats(input.places),
    favorites: selectFavoriteTrips(input.places, input.selectedAlbumIds),
    clusters: clusterJourneyPoints(input.points),
    gpsPhotoCount: input.points.filter(
      (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180,
    ).length,
  };
}

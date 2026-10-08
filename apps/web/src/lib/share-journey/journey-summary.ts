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

/**
 * Groups GPS photos into places: `cellDegrees` grid cells, centred on the mean
 * position of their photos. Biggest clusters first.
 */
export function clusterJourneyPoints(
  points: readonly JourneyPoint[],
  cellDegrees = 3,
): JourneyCluster[] {
  const cells = new Map<string, JourneyPoint[]>();
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
    if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) continue;
    const key = `${Math.floor(point.latitude / cellDegrees)}:${Math.floor(point.longitude / cellDegrees)}`;
    const list = cells.get(key);
    if (list) list.push(point);
    else cells.set(key, [point]);
  }
  const clusters: JourneyCluster[] = [];
  for (const list of cells.values()) {
    const latitude = list.reduce((sum, p) => sum + p.latitude, 0) / list.length;
    const longitude = list.reduce((sum, p) => sum + p.longitude, 0) / list.length;
    const dated = list
      .map((p) => p.capturedAt)
      .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value as string)))
      .sort();
    clusters.push({
      latitude,
      longitude,
      count: list.length,
      photoId: list[0]!.photoId,
      firstAt: dated[0] ?? null,
    });
  }
  return clusters.sort((a, b) => b.count - a.count);
}

export interface JourneySummary {
  readonly displayName: string;
  readonly bio: string | null;
  readonly countryCodes: readonly string[];
  readonly period: string | null;
  readonly stats: JourneyStats;
  readonly favorites: readonly FavoriteTrip[];
  readonly clusters: readonly JourneyCluster[];
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
  };
}

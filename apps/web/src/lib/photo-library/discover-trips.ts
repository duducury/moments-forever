/**
 * Finds likely trips in the phone library from metadata alone (dates + GPS).
 * Pure and local: no network, no pixels, no server. Nothing is created here —
 * the result is only a list of suggestions for the user to accept or ignore.
 *
 * How it decides:
 *  1. "Home" = the place with the most distinct days of photos. Photos taken
 *     near home are not trips.
 *  2. Photos far from home, in time order, form a trip until there is a gap of
 *     more than `maxGapDays` or the place jumps by more than `jumpKm`
 *     (Paris 10–12 + Paris 13–15 → one trip; Paris → Rome → two).
 *  3. Photos without GPS join a trip when their day falls inside its dates.
 *  4. Tiny groups (a few photos) are noise and are dropped.
 */

import {
  centroid,
  dayDiff,
  dayOf,
  distanceKm,
  validGeo,
} from "./geo";
import type { DiscoveredTrip, GeoPoint, LibraryAsset } from "./types";

export interface DiscoverOptions {
  /** Photos closer than this to home are "at home". */
  readonly homeRadiusKm?: number;
  /** Days without photos away from home that still keep one trip together. */
  readonly maxGapDays?: number;
  /** Moving farther than this from the trip's center starts a new trip. */
  readonly jumpKm?: number;
  readonly minPhotos?: number;
  readonly minGeotagged?: number;
  /** Home needs at least this many distinct days with photos, else it is unknown. */
  readonly minHomeDays?: number;
}

const DEFAULTS = {
  homeRadiusKm: 60,
  maxGapDays: 2,
  jumpKm: 250,
  minPhotos: 6,
  minGeotagged: 3,
  minHomeDays: 10,
} as const;

interface Dated {
  readonly asset: LibraryAsset;
  readonly time: number;
  readonly day: string;
  readonly point: GeoPoint | null;
}

function toDated(assets: readonly LibraryAsset[]): Dated[] {
  const result: Dated[] = [];
  for (const asset of assets) {
    const time = asset.takenAt ? Date.parse(asset.takenAt) : Number.NaN;
    const day = dayOf(asset.takenAt);
    if (!Number.isFinite(time) || !day) continue;
    result.push({
      asset,
      time,
      day,
      point: validGeo(asset.latitude, asset.longitude),
    });
  }
  return result.sort((a, b) => a.time - b.time);
}

/**
 * Where the person lives: the ~55 km grid cell (with its neighbours) that has
 * photos on the most different days. Returns null when there is not enough data.
 */
export function detectHome(
  assets: readonly LibraryAsset[],
  minHomeDays: number = DEFAULTS.minHomeDays,
): GeoPoint | null {
  const daysByCell = new Map<string, Set<string>>();
  const pointsByCell = new Map<string, GeoPoint[]>();
  const cellOf = (point: GeoPoint) =>
    `${Math.floor(point.latitude / 0.5)}:${Math.floor(point.longitude / 0.5)}`;

  for (const item of toDated(assets)) {
    if (!item.point) continue;
    const key = cellOf(item.point);
    const days = daysByCell.get(key) ?? new Set<string>();
    days.add(item.day);
    daysByCell.set(key, days);
    const points = pointsByCell.get(key) ?? [];
    points.push(item.point);
    pointsByCell.set(key, points);
  }

  let bestKey: string | null = null;
  let bestScore = 0;
  for (const key of daysByCell.keys()) {
    const [latCell, lonCell] = key.split(":").map(Number) as [number, number];
    const union = new Set<string>();
    for (let dLat = -1; dLat <= 1; dLat += 1) {
      for (let dLon = -1; dLon <= 1; dLon += 1) {
        for (const day of daysByCell.get(`${latCell + dLat}:${lonCell + dLon}`) ?? []) {
          union.add(day);
        }
      }
    }
    if (union.size > bestScore) {
      bestScore = union.size;
      bestKey = key;
    }
  }

  if (!bestKey || bestScore < minHomeDays) return null;
  return centroid(pointsByCell.get(bestKey) ?? []);
}

interface Draft {
  geotagged: Dated[];
  startDay: string;
  endDay: string;
  runningLat: number;
  runningLon: number;
}

export function discoverTrips(
  assets: readonly LibraryAsset[],
  options: DiscoverOptions = {},
): DiscoveredTrip[] {
  const config = { ...DEFAULTS, ...options };
  const dated = toDated(assets);
  if (dated.length === 0) return [];

  const home = detectHome(assets, config.minHomeDays);
  const isAtHome = (point: GeoPoint) =>
    home !== null && distanceKm(point, home) <= config.homeRadiusKm;

  const away = dated.filter((item) => item.point && !isAtHome(item.point));
  const drafts: Draft[] = [];
  let current: Draft | null = null;

  for (const item of away) {
    const point = item.point as GeoPoint;
    if (current) {
      const center: GeoPoint = {
        latitude: current.runningLat / current.geotagged.length,
        longitude: current.runningLon / current.geotagged.length,
      };
      const gap = dayDiff(current.endDay, item.day);
      if (gap > config.maxGapDays || distanceKm(point, center) > config.jumpKm) {
        drafts.push(current);
        current = null;
      }
    }
    if (!current) {
      current = {
        geotagged: [],
        startDay: item.day,
        endDay: item.day,
        runningLat: 0,
        runningLon: 0,
      };
    }
    current.geotagged.push(item);
    current.runningLat += point.latitude;
    current.runningLon += point.longitude;
    if (item.day > current.endDay) current.endDay = item.day;
    if (item.day < current.startDay) current.startDay = item.day;
  }
  if (current) drafts.push(current);

  // Photos without GPS: placed by date only. A photo claimed by one trip is not offered in another.
  const ungeotagged = dated.filter((item) => !item.point);
  const claimed = new Set<string>();
  const result: DiscoveredTrip[] = [];

  for (const draft of drafts) {
    const withoutGps = ungeotagged.filter(
      (item) =>
        item.day >= draft.startDay &&
        item.day <= draft.endDay &&
        !claimed.has(item.asset.nativeId),
    );
    const members: Dated[] = [...draft.geotagged, ...withoutGps];
    if (
      members.length < config.minPhotos ||
      draft.geotagged.length < config.minGeotagged
    ) {
      continue;
    }
    for (const item of withoutGps) claimed.add(item.asset.nativeId);

    members.sort((a, b) => a.time - b.time);
    const points = draft.geotagged.map((item) => item.point as GeoPoint);
    const center = centroid(points);
    const radiusKm = center
      ? Math.max(...points.map((point) => distanceKm(point, center)))
      : 0;
    const first = members[0] as Dated;
    const last = members[members.length - 1] as Dated;
    result.push({
      id: `trip-${first.day}-${first.asset.nativeId}`,
      startDate: first.day,
      endDate: last.day,
      center,
      radiusKm,
      assets: members.map((item) => item.asset),
      withoutLocationCount: withoutGps.length,
    });
  }

  // Newest trip first — what the person most likely wants to keep.
  return result.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

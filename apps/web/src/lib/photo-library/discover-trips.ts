/**
 * Finds likely trips in the phone library from metadata alone (dates + GPS).
 * Pure and local: no network, no pixels, no server. Nothing is created here —
 * the result is only a list of suggestions for the person to accept or ignore.
 *
 * It thinks like a trip, not like "a cluster of photos":
 *  1. "Home" = where most days of photos are. Photos near home are not a trip,
 *     and a photo taken at home *between* two away periods means the person
 *     went back — that splits trips.
 *  2. Away photos, in time order, become **stays** (≈ one city: within 50 km).
 *  3. Stays chain into one trip while the story is continuous:
 *       - back to a place already visited on the trip (New York → Boston →
 *         New York) or the same place after a quiet stretch with no sign of
 *         home (up to 6 days, e.g. a day with no photos): same trip;
 *       - a different place: the next day up to ~700 km, or within 3 days up
 *         to ~450 km (New York → Boston); farther than that is another trip
 *         (Paris → Rome is two trips; so are "Brasil 2024" and "Brasil 2026").
 *  4. Photos without GPS join by date. Tiny groups are noise and are dropped.
 *     With 1–2 GPS photos it is still offered, but only as a "possible trip with
 *     limited location": the place is never trusted or named, it is not matched by
 *     place, and any sign of home during those days rules it out. With no GPS at
 *     all, a run of ≥ 2 consecutive days with a clearly unusual burst of photos
 *     (and no GPS or home photo on those days) is offered as a "possible trip".
 *  5. The most representative places are kept (≤ 3, in visiting order) to name
 *     the trip — a place with only a couple of photos is not listed.
 */

import {
  centroid,
  dayDiff,
  dayOf,
  distanceKm,
  validGeo,
} from "./geo";
import type { DiscoveredTrip, GeoPoint, LibraryAsset, TripStop } from "./types";

export interface DiscoverOptions {
  /** Photos closer than this to home are "at home". */
  readonly homeRadiusKm?: number;
  /** One stay = photos within this radius of its running center (≈ a city). */
  readonly stayKm?: number;
  /** Same place after this many quiet days (with no home photos in between) is a new trip. */
  readonly sameplaceGapDays?: number;
  readonly minPhotos?: number;
  /** A trip needs at least this many photos with GPS far from home. */
  readonly minGeotagged?: number;
  /** Fewer GPS photos than this and the trip is only a "possible trip" with limited location. */
  readonly minLocatedForName?: number;
  /** No-GPS "possible trips": at least this many photos over at least this many days… */
  readonly noLocationMinPhotos?: number;
  readonly noLocationMinDays?: number;
  /** …and a daily rate of at least max(this, factor × the library's usual photos per active day). */
  readonly noLocationMinPerDay?: number;
  readonly noLocationDensityFactor?: number;
  /** Home needs at least this many distinct days with photos, else it is unknown. */
  readonly minHomeDays?: number;
  /** Radius that groups photos into one *named* stop of a trip. */
  readonly stopKm?: number;
}

const DEFAULTS = {
  homeRadiusKm: 60,
  stayKm: 50,
  sameplaceGapDays: 6,
  minPhotos: 6,
  minGeotagged: 1,
  minLocatedForName: 3,
  noLocationMinPhotos: 15,
  noLocationMinDays: 2,
  noLocationMinPerDay: 5,
  noLocationDensityFactor: 2,
  minHomeDays: 10,
  stopKm: 15,
} as const;

/** Moving to a different place keeps the trip together if the legs make sense. */
const NEXT_DAY_MAX_KM = 700;
const NEAR_DAYS_MAX = 3;
const NEAR_DAYS_MAX_KM = 450;
const REVISIT_KM = 60;
const MAX_STOPS = 3;
const MIN_STOP_PHOTOS = 4;
const MIN_STOP_SHARE = 0.1;

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

interface Stay {
  readonly photos: Dated[];
  startDay: string;
  endDay: string;
  sumLat: number;
  sumLon: number;
}

function stayCenter(stay: Stay): GeoPoint {
  return {
    latitude: stay.sumLat / stay.photos.length,
    longitude: stay.sumLon / stay.photos.length,
  };
}

/**
 * The places that best describe a trip, in visiting order. Small clusters are
 * merged by proximity; places with only a couple of photos are left out.
 */
function representativeStops(
  tripId: string,
  geotagged: readonly Dated[],
  stopKm: number,
): TripStop[] {
  interface Cluster {
    photos: Dated[];
    sumLat: number;
    sumLon: number;
  }
  const clusters: Cluster[] = [];
  for (const item of geotagged) {
    const point = item.point as GeoPoint;
    let target: Cluster | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const cluster of clusters) {
      const distance = distanceKm(point, {
        latitude: cluster.sumLat / cluster.photos.length,
        longitude: cluster.sumLon / cluster.photos.length,
      });
      if (distance <= stopKm && distance < best) {
        target = cluster;
        best = distance;
      }
    }
    if (!target) {
      target = { photos: [], sumLat: 0, sumLon: 0 };
      clusters.push(target);
    }
    target.photos.push(item);
    target.sumLat += point.latitude;
    target.sumLon += point.longitude;
  }

  const total = geotagged.length;
  const ranked = [...clusters].sort((a, b) => b.photos.length - a.photos.length);
  const kept = ranked
    .filter(
      (cluster, index) =>
        index === 0 ||
        (cluster.photos.length >= MIN_STOP_PHOTOS &&
          cluster.photos.length / total >= MIN_STOP_SHARE),
    )
    .slice(0, MAX_STOPS);

  return kept
    .map((cluster) => ({
      cluster,
      firstTime: Math.min(...cluster.photos.map((item) => item.time)),
    }))
    .sort((a, b) => a.firstTime - b.firstTime)
    .map(({ cluster }, index): TripStop => ({
      id: `${tripId}:stop-${index + 1}`,
      center: {
        latitude: cluster.sumLat / cluster.photos.length,
        longitude: cluster.sumLon / cluster.photos.length,
      },
      photoCount: cluster.photos.length,
      firstDay: cluster.photos.reduce(
        (first, item) => (item.day < first ? item.day : first),
        cluster.photos[0]?.day ?? "",
      ),
    }));
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

  // Days the person was demonstrably at home: seeing one between two away
  // periods means they came back, so those are different trips.
  const homeDays = dated
    .filter((item) => item.point && isAtHome(item.point))
    .map((item) => item.day)
    .sort();
  const homeBetween = (afterDay: string, beforeDay: string): boolean =>
    homeDays.some((day) => day > afterDay && day < beforeDay);

  // 1. Stays: runs of away photos within ~one city.
  const away = dated.filter((item) => item.point && !isAtHome(item.point));
  const stays: Stay[] = [];
  let current: Stay | null = null;
  for (const item of away) {
    const point = item.point as GeoPoint;
    if (current) {
      const center = stayCenter(current);
      const gap = dayDiff(current.endDay, item.day);
      if (
        distanceKm(point, center) > config.stayKm ||
        gap > config.sameplaceGapDays ||
        (gap > 1 && homeBetween(current.endDay, item.day))
      ) {
        stays.push(current);
        current = null;
      }
    }
    if (!current) {
      current = { photos: [], startDay: item.day, endDay: item.day, sumLat: 0, sumLon: 0 };
    }
    current.photos.push(item);
    current.sumLat += point.latitude;
    current.sumLon += point.longitude;
    if (item.day > current.endDay) current.endDay = item.day;
    if (item.day < current.startDay) current.startDay = item.day;
  }
  if (current) stays.push(current);

  // 2. Chain stays into trips while the story stays continuous.
  const chains: Stay[][] = [];
  for (const stay of stays) {
    const chain = chains[chains.length - 1];
    const previous = chain?.[chain.length - 1];
    if (!chain || !previous) {
      chains.push([stay]);
      continue;
    }
    const gap = dayDiff(previous.endDay, stay.startDay);
    const center = stayCenter(stay);
    const sinceBetween = gap > 1 && homeBetween(previous.endDay, stay.startDay);
    const revisit = chain.some(
      (earlier) => distanceKm(center, stayCenter(earlier)) <= REVISIT_KM,
    );
    const legKm = distanceKm(center, stayCenter(previous));
    const continuous =
      !sinceBetween &&
      ((revisit && gap <= config.sameplaceGapDays) ||
        (gap <= 1 && legKm <= NEXT_DAY_MAX_KM) ||
        (gap <= NEAR_DAYS_MAX && legKm <= NEAR_DAYS_MAX_KM));
    if (continuous) chain.push(stay);
    else chains.push([stay]);
  }

  // 3. Photos without GPS: placed by date only. A photo claimed by one trip is not offered in another.
  const ungeotagged = dated.filter((item) => !item.point);
  const claimed = new Set<string>();
  const result: DiscoveredTrip[] = [];

  for (const chain of chains) {
    const geotagged = chain.flatMap((stay) => stay.photos);
    const startDay = chain.map((stay) => stay.startDay).sort()[0] as string;
    const endDay = chain.map((stay) => stay.endDay).sort().reverse()[0] as string;
    const withoutGps = ungeotagged.filter(
      (item) =>
        item.day >= startDay &&
        item.day <= endDay &&
        !claimed.has(item.asset.nativeId),
    );
    const members: Dated[] = [...geotagged, ...withoutGps];
    if (
      members.length < config.minPhotos ||
      geotagged.length < config.minGeotagged
    ) {
      continue;
    }
    const located = geotagged.length >= config.minLocatedForName;
    // 1–2 GPS photos prove little: any photo at home during these days rules it out.
    if (!located && homeDays.some((day) => day >= startDay && day <= endDay)) {
      continue;
    }
    for (const item of withoutGps) claimed.add(item.asset.nativeId);

    members.sort((a, b) => a.time - b.time);
    const points = geotagged.map((item) => item.point as GeoPoint);
    // A "limited" trip's one or two points are not trusted for place or matching.
    const center = located ? centroid(points) : null;
    const radiusKm = center
      ? Math.max(...points.map((point) => distanceKm(point, center)))
      : 0;
    const first = members[0] as Dated;
    const last = members[members.length - 1] as Dated;
    const id = `trip-${first.day}-${first.asset.nativeId}`;
    result.push({
      id,
      startDate: first.day,
      endDate: last.day,
      center,
      radiusKm,
      assets: members.map((item) => item.asset),
      withoutLocationCount: withoutGps.length,
      // Too little GPS to say where it was: no stops, so it is never given a made-up place.
      stops: located ? representativeStops(id, geotagged, config.stopKm) : [],
      locationQuality: located ? "located" : "limited",
    });
  }

  // 4. No GPS at all: only a clear, multi-day burst, with nothing pointing at home or at a place.
  const leftover = ungeotagged.filter((item) => !claimed.has(item.asset.nativeId));
  if (leftover.length > 0) {
    const perDay = new Map<string, number>();
    for (const item of dated) perDay.set(item.day, (perDay.get(item.day) ?? 0) + 1);
    const counts = [...perDay.values()].sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)] ?? 1;
    const minPerDay = Math.max(
      config.noLocationMinPerDay,
      config.noLocationDensityFactor * median,
    );
    const gpsDays = new Set(dated.filter((item) => item.point).map((item) => item.day));

    const byDay = new Map<string, Dated[]>();
    for (const item of leftover) {
      byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
    }
    const days = [...byDay.keys()].sort();
    const runs: string[][] = [];
    for (const day of days) {
      const run = runs[runs.length - 1];
      const previous = run?.[run.length - 1];
      if (run && previous && dayDiff(previous, day) <= 1) run.push(day);
      else runs.push([day]);
    }

    for (const run of runs) {
      const first = run[0] as string;
      const last = run[run.length - 1] as string;
      const span = dayDiff(first, last) + 1;
      const members = run.flatMap((day) => byDay.get(day) ?? []);
      const touchesGps = [...gpsDays].some((day) => day >= first && day <= last);
      const touchesHome = homeDays.some((day) => day >= first && day <= last);
      if (
        span < config.noLocationMinDays ||
        members.length < config.noLocationMinPhotos ||
        members.length / span < minPerDay ||
        touchesGps ||
        touchesHome
      ) {
        continue;
      }
      members.sort((a, b) => a.time - b.time);
      const firstPhoto = members[0] as Dated;
      result.push({
        id: `trip-${first}-${firstPhoto.asset.nativeId}`,
        startDate: first,
        endDate: last,
        center: null,
        radiusKm: 0,
        assets: members.map((item) => item.asset),
        withoutLocationCount: members.length,
        stops: [],
        locationQuality: "none",
      });
    }
  }

  // Newest trip first — what the person most likely wants to keep.
  return result.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

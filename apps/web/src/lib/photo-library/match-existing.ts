/**
 * Compares what the library holds against what Moments Forever already has.
 * Conservative on purpose: two different trips are never merged just because
 * they are in the same country ("Brasil 2024" ≠ "Brasil 2026"), and nothing is
 * decided without the person confirming.
 *
 * "Already there" is a *current* fact, recomputed every time from the photos
 * that exist now (photos.source_asset_id, or date+place for photos imported
 * before that column existed). A deleted photo is simply not there any more, so
 * it is offered again — there is no permanent "already imported" list.
 */

import { addDays, dayDiff, dayOf, distanceKm, validGeo } from "./geo";
import type {
  DiscoveredTrip,
  ExistingTrip,
  KnownAsset,
  LegacyPhoto,
  LibraryAsset,
} from "./types";
import { buildSourceAssetId } from "./source-asset-id";

export const PERIOD_TOLERANCE_DAYS = 2;
const SAME_PLACE_KM = 150;
const NEAR_TRIP_MIN_KM = 30;
const NEAR_TRIP_MAX_KM = 300;
const LEGACY_PLACE_KM = 0.15;
const LEGACY_SECONDS = 2;
const LEGACY_MAX_OFFSET_MIN = 14 * 60;

export function assetSourceId(asset: LibraryAsset): string {
  return buildSourceAssetId(asset.platform, asset.nativeId);
}

// --- "is this library photo already in Moments Forever?" --------------------

function aspect(width: number, height: number): number | null {
  if (!(width > 0) || !(height > 0)) return null;
  return Math.min(width, height) / Math.max(width, height);
}

/**
 * Photos imported before source_asset_id: same place (≈150 m), same capture
 * time — allowing a whole-quarter-hour offset, because their time was read from
 * EXIF in the phone's timezone at import — and the same shape. Needs GPS on
 * both sides; without it a photo is never declared "already there", so the
 * worst case is a suggestion the person can untick, never a hidden photo.
 */
export function matchesLegacyPhoto(
  asset: LibraryAsset,
  legacy: LegacyPhoto,
): boolean {
  const assetPoint = validGeo(asset.latitude, asset.longitude);
  const legacyPoint = validGeo(legacy.latitude, legacy.longitude);
  if (!assetPoint || !legacyPoint || !asset.takenAt || !legacy.capturedAt) {
    return false;
  }
  if (distanceKm(assetPoint, legacyPoint) > LEGACY_PLACE_KM) return false;

  const diffSeconds = Math.abs(Date.parse(asset.takenAt) - Date.parse(legacy.capturedAt)) / 1000;
  if (!Number.isFinite(diffSeconds)) return false;
  const quarter = 15 * 60;
  const nearest = Math.round(diffSeconds / quarter) * quarter;
  if (nearest / 60 > LEGACY_MAX_OFFSET_MIN) return false;
  if (Math.abs(diffSeconds - nearest) > LEGACY_SECONDS) return false;

  const assetAspect = aspect(asset.width, asset.height);
  const legacyAspect = aspect(legacy.width ?? 0, legacy.height ?? 0);
  if (assetAspect !== null && legacyAspect !== null) {
    if (Math.abs(assetAspect - legacyAspect) > 0.02) return false;
  }
  return true;
}

export interface PresenceIndex {
  readonly knownIds: ReadonlySet<string>;
  readonly legacy: readonly LegacyPhoto[];
}

/** Presence inside one trip (experience): its own source ids + its legacy photos. */
export function buildPresenceIndex(input: {
  readonly knownAssets: readonly KnownAsset[];
  readonly legacyPhotos?: readonly LegacyPhoto[];
  /** Restrict to one experience; omit for "anywhere in the account". */
  readonly experienceId?: string;
}): PresenceIndex {
  const knownIds = new Set<string>();
  for (const known of input.knownAssets) {
    if (!input.experienceId || known.experienceId === input.experienceId) {
      knownIds.add(known.assetId);
    }
  }
  return { knownIds, legacy: input.legacyPhotos ?? [] };
}

export function isAlreadyInTrip(asset: LibraryAsset, presence: PresenceIndex): boolean {
  if (presence.knownIds.has(assetSourceId(asset))) return true;
  return presence.legacy.some((legacy) => matchesLegacyPhoto(asset, legacy));
}

export function withoutPresent(
  assets: readonly LibraryAsset[],
  presence: PresenceIndex,
): LibraryAsset[] {
  return assets.filter((asset) => !isAlreadyInTrip(asset, presence));
}

// --- matching discovered trips with existing ones ---------------------------

export type TripMatch =
  | { readonly kind: "new"; readonly similarTo: ExistingTrip | null }
  | {
      readonly kind: "existing";
      readonly trip: ExistingTrip;
      readonly reason: "photos" | "period-and-place";
    };

function periodOverlapDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
  tolerance: number,
): number {
  const start = aStart > addDays(bStart, -tolerance) ? aStart : addDays(bStart, -tolerance);
  const end = aEnd < addDays(bEnd, tolerance) ? aEnd : addDays(bEnd, tolerance);
  return dayDiff(start, end) + 1;
}

function existingPeriod(trip: ExistingTrip): { start: string; end: string } | null {
  const start = dayOf(trip.startsAt);
  const end = dayOf(trip.endsAt ?? trip.startsAt);
  if (!start || !end) return null;
  return { start, end };
}

function samePlace(
  discovered: DiscoveredTrip,
  discoveredCountry: string | null,
  existing: ExistingTrip,
): boolean {
  if (discovered.center && existing.center) {
    return (
      distanceKm(discovered.center, existing.center) <=
      SAME_PLACE_KM + (existing.radiusKm ?? 0) + discovered.radiusKm
    );
  }
  // One side has no GPS: only the country can speak, and only if both know it.
  return Boolean(
    discoveredCountry &&
      existing.countryCode &&
      discoveredCountry === existing.countryCode,
  );
}

export function matchDiscoveredTrip(input: {
  readonly trip: DiscoveredTrip;
  /** Country of the trip's center, once geocoded; null while unknown. */
  readonly countryCode: string | null;
  readonly existingTrips: readonly ExistingTrip[];
  readonly knownAssets: readonly KnownAsset[];
}): TripMatch {
  const { trip, countryCode, existingTrips, knownAssets } = input;

  // 1. Strongest signal: its photos are already stored somewhere.
  const known = new Map(knownAssets.map((item) => [item.assetId, item] as const));
  const holders = new Map<string, number>();
  for (const asset of trip.assets) {
    const hit = known.get(assetSourceId(asset));
    if (hit?.albumId) holders.set(hit.albumId, (holders.get(hit.albumId) ?? 0) + 1);
  }
  let bestAlbum: string | null = null;
  let bestCount = 0;
  for (const [albumId, count] of holders) {
    if (count > bestCount) {
      bestAlbum = albumId;
      bestCount = count;
    }
  }
  if (bestAlbum && bestCount >= Math.min(5, Math.ceil(trip.assets.length / 2))) {
    const holder = existingTrips.find((item) => item.albumId === bestAlbum);
    if (holder) return { kind: "existing", trip: holder, reason: "photos" };
  }

  // 2. Same period AND same place.
  let best: { trip: ExistingTrip; overlap: number } | null = null;
  let similar: ExistingTrip | null = null;
  for (const candidate of existingTrips) {
    const period = existingPeriod(candidate);
    if (!period) continue;
    const overlap = periodOverlapDays(
      trip.startDate,
      trip.endDate,
      period.start,
      period.end,
      PERIOD_TOLERANCE_DAYS,
    );
    const place = samePlace(trip, countryCode, candidate);
    if (overlap > 0 && place) {
      if (!best || overlap > best.overlap) best = { trip: candidate, overlap };
    } else if (
      !similar &&
      countryCode &&
      candidate.countryCode === countryCode
    ) {
      // Same country, different time: a hint only — "Brasil 2024" is not "Brasil 2026".
      similar = candidate;
    }
  }
  if (best) {
    return { kind: "existing", trip: best.trip, reason: "period-and-place" };
  }
  return { kind: "new", similarTo: similar };
}

// --- "Encontrar fotos" inside an existing trip ------------------------------

export interface RelatedPhotos {
  readonly window: { readonly start: string; readonly end: string } | null;
  readonly assets: readonly LibraryAsset[];
  /** Why nothing could be searched (shown to the person). */
  readonly unavailable: "no-dates" | null;
}

/**
 * Library photos that plausibly belong to an existing trip: taken during its
 * dates (±1 day) and near its places — or without GPS but on those days —
 * minus what is already in the trip right now.
 */
export function findRelatedAssets(input: {
  readonly assets: readonly LibraryAsset[];
  readonly trips: readonly ExistingTrip[];
  readonly presence: PresenceIndex;
}): RelatedPhotos {
  const periods = input.trips
    .map((trip) => ({ trip, period: existingPeriod(trip) }))
    .filter((item): item is { trip: ExistingTrip; period: { start: string; end: string } } =>
      item.period !== null,
    );
  if (periods.length === 0) {
    return { window: null, assets: [], unavailable: "no-dates" };
  }

  const start = periods.map((item) => item.period.start).sort()[0] as string;
  const end = periods.map((item) => item.period.end).sort().reverse()[0] as string;
  const windowStart = addDays(start, -1);
  const windowEnd = addDays(end, 1);

  const nearAnyTripPlace = (asset: LibraryAsset): boolean => {
    const point = validGeo(asset.latitude, asset.longitude);
    if (!point) return true; // no GPS: the date decides
    const places = input.trips.filter((trip) => trip.center);
    if (places.length === 0) return true;
    return places.some((trip) => {
      const near = Math.min(
        NEAR_TRIP_MAX_KM,
        Math.max(NEAR_TRIP_MIN_KM, (trip.radiusKm ?? 0) + NEAR_TRIP_MIN_KM),
      );
      return distanceKm(point, trip.center as { latitude: number; longitude: number }) <= near;
    });
  };

  const candidates = input.assets.filter((asset) => {
    const day = dayOf(asset.takenAt);
    return day !== null && day >= windowStart && day <= windowEnd && nearAnyTripPlace(asset);
  });

  return {
    window: { start: windowStart, end: windowEnd },
    assets: withoutPresent(candidates, input.presence).sort((a, b) =>
      (a.takenAt ?? "").localeCompare(b.takenAt ?? ""),
    ),
    unavailable: null,
  };
}

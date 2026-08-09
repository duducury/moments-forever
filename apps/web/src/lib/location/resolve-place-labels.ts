/**
 * Reverse-geocode place clusters (one lookup per unique rounded coordinate).
 * Never throws to callers of the import pipeline — failures keep Lugar N.
 */

import {
  applySuggestedNamesById,
  canApplySuggestedPlaceName,
  collectGeocodeLookups,
  geocodeCacheKey,
  isGenericLocationLabel,
  type ExperienceImportDraft,
} from "@moments-forever/shared";

import {
  getCachedGeocodeLabel,
  setCachedGeocodeLabel,
} from "./geocode-memory-cache";
import {
  createNominatimClient,
  type NominatimClient,
} from "./nominatim-client";

export interface ResolvePlaceLabelsOptions {
  readonly client?: NominatimClient;
  /** Optional seed from already-known place labels (e.g. user's other places). */
  readonly seedCache?: ReadonlyMap<string, string>;
}

export interface ResolvePlaceLabelsStats {
  readonly lookupCount: number;
  readonly networkCount: number;
  readonly resolvedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
}

function seedMemory(seedCache?: ReadonlyMap<string, string>): void {
  if (!seedCache) return;
  for (const [key, label] of seedCache) {
    if (getCachedGeocodeLabel(key) === undefined) {
      setCachedGeocodeLabel(key, label);
    }
  }
}

/**
 * Resolve unique coordinate keys → travel labels.
 * Network calls are deduped by {@link geocodeCacheKey} and process memory cache.
 */
export async function resolveLabelsForCoordinates(
  points: readonly {
    readonly key: string;
    readonly latitude: number;
    readonly longitude: number;
  }[],
  options: ResolvePlaceLabelsOptions = {},
): Promise<{
  readonly labels: Map<string, string>;
  readonly stats: ResolvePlaceLabelsStats;
}> {
  const client = options.client ?? createNominatimClient();
  seedMemory(options.seedCache);

  const labels = new Map<string, string>();
  let networkCount = 0;
  let resolvedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const point of points) {
    const cached = getCachedGeocodeLabel(point.key);
    if (cached !== undefined) {
      skippedCount += 1;
      if (cached) {
        labels.set(point.key, cached);
        resolvedCount += 1;
      }
      continue;
    }

    networkCount += 1;
    const result = await client.reverseGeocode(
      point.latitude,
      point.longitude,
    );

    if (result.status === "rate_limited") {
      // One retry after the client already waited.
      const retry = await client.reverseGeocode(
        point.latitude,
        point.longitude,
      );
      networkCount += 1;
      if (retry.label) {
        setCachedGeocodeLabel(point.key, retry.label);
        labels.set(point.key, retry.label);
        resolvedCount += 1;
      } else {
        setCachedGeocodeLabel(point.key, null);
        failedCount += 1;
      }
      continue;
    }

    if (result.label) {
      setCachedGeocodeLabel(point.key, result.label);
      labels.set(point.key, result.label);
      resolvedCount += 1;
    } else {
      // Cache misses (empty/error/timeout) as null to avoid hammering Nominatim.
      setCachedGeocodeLabel(point.key, null);
      if (result.status === "empty") {
        skippedCount += 1;
      } else {
        failedCount += 1;
      }
    }
  }

  return {
    labels,
    stats: {
      lookupCount: points.length,
      networkCount,
      resolvedCount,
      skippedCount,
      failedCount,
    },
  };
}

/**
 * Enrich an import draft's places with Nominatim labels.
 * On any unexpected failure, returns the original draft unchanged.
 */
export async function enrichImportDraftPlaces(
  draft: ExperienceImportDraft,
  options: ResolvePlaceLabelsOptions = {},
): Promise<{
  readonly draft: ExperienceImportDraft;
  readonly stats: ResolvePlaceLabelsStats;
}> {
  try {
    const lookups = collectGeocodeLookups(
      draft.places.map((place) => ({
        id: place.id,
        latitude: place.exactLatitude ?? Number.NaN,
        longitude: place.exactLongitude ?? Number.NaN,
        name: place.name,
        confirmedByUser: place.confirmedByUser,
      })),
      canApplySuggestedPlaceName,
    );

    if (lookups.length === 0) {
      return {
        draft,
        stats: {
          lookupCount: 0,
          networkCount: 0,
          resolvedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        },
      };
    }

    const { labels, stats } = await resolveLabelsForCoordinates(
      lookups.map((lookup) => ({
        key: lookup.key,
        latitude: lookup.latitude,
        longitude: lookup.longitude,
      })),
      options,
    );

    const suggestions = new Map<string, string>();
    for (const lookup of lookups) {
      const label = labels.get(lookup.key);
      if (!label) continue;
      for (const targetId of lookup.targetIds) {
        suggestions.set(targetId, label);
      }
    }

    if (suggestions.size === 0) {
      return { draft, stats };
    }

    const places = applySuggestedNamesById(draft.places, suggestions);
    const placeNameById = new Map(places.map((place) => [place.id, place.name]));
    const moments = draft.moments.map((moment) => {
      if (!moment.placeId) return moment;
      const nextName = placeNameById.get(moment.placeId);
      if (!nextName || nextName === moment.title) return moment;
      if (
        moment.title &&
        !canApplySuggestedPlaceName({
          name: moment.title,
          confirmedByUser: moment.confirmedByUser,
        })
      ) {
        return moment;
      }
      return { ...moment, title: nextName };
    });

    return {
      draft: {
        ...draft,
        places,
        moments,
      },
      stats,
    };
  } catch {
    return {
      draft,
      stats: {
        lookupCount: 0,
        networkCount: 0,
        resolvedCount: 0,
        skippedCount: 0,
        failedCount: 1,
      },
    };
  }
}

/** Seed memory cache from places that already have a useful label. */
export function buildSeedCacheFromPlaces(
  places: readonly {
    readonly name: string;
    readonly exactLatitude: number | null;
    readonly exactLongitude: number | null;
  }[],
): Map<string, string> {
  const seed = new Map<string, string>();
  for (const place of places) {
    if (
      place.exactLatitude === null ||
      place.exactLongitude === null ||
      !Number.isFinite(place.exactLatitude) ||
      !Number.isFinite(place.exactLongitude)
    ) {
      continue;
    }
    if (!place.name || isGenericLocationLabel(place.name)) continue;
    const key = geocodeCacheKey(place.exactLatitude, place.exactLongitude);
    seed.set(key, place.name);
  }
  return seed;
}

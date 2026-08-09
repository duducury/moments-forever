import {
  canApplySuggestedPlaceName,
  collectGeocodeLookups,
  isGenericLocationLabel,
} from "@moments-forever/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildSeedCacheFromPlaces,
  resolveLabelsForCoordinates,
  type ResolvePlaceLabelsOptions,
  type ResolvePlaceLabelsStats,
} from "./resolve-place-labels";

export interface IdentifyExperiencePlacesResult {
  readonly updated: number;
  readonly stats: ResolvePlaceLabelsStats;
}

/**
 * Reverse-geocode generic places for an experience and write `places.name`.
 * Skips user-confirmed non-generic names. Does not throw on Nominatim errors.
 */
export async function identifyExperiencePlaces(
  supabase: SupabaseClient,
  experienceId: string,
  options: ResolvePlaceLabelsOptions = {},
): Promise<IdentifyExperiencePlacesResult> {
  const placesResult = await supabase
    .from("places")
    .select(
      "id, name, exact_latitude, exact_longitude, confirmed_by_user, experience_id",
    )
    .eq("experience_id", experienceId);

  if (placesResult.error) {
    throw new Error(placesResult.error.message);
  }

  const places = placesResult.data ?? [];
  const seedCache = buildSeedCacheFromPlaces(
    places.map((place) => ({
      name: place.name as string,
      exactLatitude: (place.exact_latitude as number | null) ?? null,
      exactLongitude: (place.exact_longitude as number | null) ?? null,
    })),
  );

  const lookups = collectGeocodeLookups(
    places.map((place) => ({
      id: place.id as string,
      latitude: Number(place.exact_latitude),
      longitude: Number(place.exact_longitude),
      name: place.name as string,
      confirmedByUser: Boolean(place.confirmed_by_user),
    })),
    canApplySuggestedPlaceName,
  );

  if (lookups.length === 0) {
    return {
      updated: 0,
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
    { ...options, seedCache },
  );

  let updated = 0;

  for (const lookup of lookups) {
    const label = labels.get(lookup.key);
    if (!label) continue;

    for (const placeId of lookup.targetIds) {
      const place = places.find((row) => row.id === placeId);
      if (!place) continue;
      if (
        !canApplySuggestedPlaceName({
          name: place.name as string,
          confirmedByUser: Boolean(place.confirmed_by_user),
        })
      ) {
        continue;
      }
      if (place.name === label) continue;

      const placeUpdate = await supabase
        .from("places")
        .update({ name: label })
        .eq("id", placeId)
        .eq("experience_id", experienceId);

      if (placeUpdate.error) continue;
      updated += 1;

      // Keep moment/album titles in sync when they are still generic.
      const moments = await supabase
        .from("moments")
        .select("id, title")
        .eq("experience_id", experienceId)
        .eq("place_id", placeId);

      for (const moment of moments.data ?? []) {
        const title = (moment.title as string | null) ?? "";
        if (title && !isGenericLocationLabel(title)) continue;

        await supabase
          .from("moments")
          .update({ title: label })
          .eq("id", moment.id as string);

        await supabase
          .from("albums")
          .update({ name: label })
          .eq("experience_id", experienceId)
          .eq("source_moment_id", moment.id as string);
      }
    }
  }

  return { updated, stats };
}

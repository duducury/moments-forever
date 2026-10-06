/**
 * Persist `places.country_code` so flags and passport stamps do not depend on
 * how a place happens to be named.
 *
 * Source of truth, in order:
 *  1. the geocoder's `address.country_code` for the place's coordinates
 *     (already in the process cache whenever the label was just resolved);
 *  2. the country in the place name (free, covers every ISO country);
 *  3. a fresh reverse-geocode of the coordinates (capped per call — Nominatim
 *     allows ~1 request/second).
 *
 * Everything here is best-effort: it never throws, and it quietly does nothing
 * when the `country_code` column has not been migrated yet.
 */

import {
  countryCodeFromPlaceLabel,
  geocodeCacheKey,
  normalizeCountryCode,
} from "@moments-forever/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCachedGeocodeCountry } from "./geocode-memory-cache";
import { resolveLabelsForCoordinates } from "./resolve-place-labels";
import type { NominatimClient } from "./nominatim-client";

export interface PersistCountryCodesOptions {
  /** Max reverse-geocode network lookups for this call (default 3). */
  readonly maxLookups?: number;
  readonly client?: NominatimClient;
}

type PlaceRow = {
  readonly id: string;
  readonly name: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly confirmed: boolean;
};

async function fillCountryCodes(
  supabase: SupabaseClient,
  rows: readonly PlaceRow[],
  options: PersistCountryCodesOptions,
): Promise<number> {
  const codeByPlace = new Map<string, string>();
  const needNetwork: PlaceRow[] = [];

  for (const row of rows) {
    const hasCoords =
      row.latitude !== null &&
      row.longitude !== null &&
      Number.isFinite(row.latitude) &&
      Number.isFinite(row.longitude);
    const geocoded =
      hasCoords && !row.confirmed
        ? getCachedGeocodeCountry(
            geocodeCacheKey(row.latitude as number, row.longitude as number),
          )
        : null;
    const code =
      normalizeCountryCode(geocoded) ??
      countryCodeFromPlaceLabel(row.name);
    if (code) {
      codeByPlace.set(row.id, code);
    } else if (hasCoords) {
      needNetwork.push(row);
    }
  }

  const maxLookups = options.maxLookups ?? 3;
  if (needNetwork.length > 0 && maxLookups > 0) {
    const byKey = new Map<string, PlaceRow[]>();
    for (const row of needNetwork) {
      const key = geocodeCacheKey(
        row.latitude as number,
        row.longitude as number,
      );
      byKey.set(key, [...(byKey.get(key) ?? []), row]);
    }
    const points = [...byKey.entries()].slice(0, maxLookups).map(
      ([key, group]) => ({
        key,
        latitude: group[0]?.latitude as number,
        longitude: group[0]?.longitude as number,
      }),
    );
    const { countryCodes } = await resolveLabelsForCoordinates(points, {
      client: options.client,
    });
    for (const point of points) {
      const code = countryCodes.get(point.key);
      if (!code) continue;
      for (const row of byKey.get(point.key) ?? []) {
        codeByPlace.set(row.id, code);
      }
    }
  }

  const idsByCode = new Map<string, string[]>();
  for (const [placeId, code] of codeByPlace) {
    idsByCode.set(code, [...(idsByCode.get(code) ?? []), placeId]);
  }
  let updated = 0;
  for (const [code, ids] of idsByCode) {
    const result = await supabase
      .from("places")
      .update({ country_code: code })
      .in("id", ids);
    if (!result.error) updated += ids.length;
  }
  return updated;
}

async function loadUnresolvedPlaces(
  supabase: SupabaseClient,
  scope:
    | { readonly experienceIds: readonly string[] }
    | { readonly ownerId: string },
): Promise<PlaceRow[]> {
  let experienceIds: readonly string[];
  if ("experienceIds" in scope) {
    experienceIds = scope.experienceIds;
  } else {
    const experiences = await supabase
      .from("experiences")
      .select("id")
      .eq("owner_id", scope.ownerId);
    if (experiences.error) return [];
    experienceIds = (experiences.data ?? []).map((row) => row.id as string);
  }
  if (experienceIds.length === 0) return [];

  const places = await supabase
    .from("places")
    .select("id, name, exact_latitude, exact_longitude, confirmed_by_user")
    .in("experience_id", experienceIds)
    .is("country_code", null);
  // Column missing (migration not applied yet) → nothing to do.
  if (places.error) return [];

  return (places.data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? "",
    latitude: (row.exact_latitude as number | null) ?? null,
    longitude: (row.exact_longitude as number | null) ?? null,
    confirmed: Boolean(row.confirmed_by_user),
  }));
}

/** Fill `country_code` for places of one experience. Returns rows updated. */
export async function persistExperiencePlaceCountryCodes(
  supabase: SupabaseClient,
  experienceId: string,
  options: PersistCountryCodesOptions = {},
): Promise<number> {
  try {
    const rows = await loadUnresolvedPlaces(supabase, {
      experienceIds: [experienceId],
    });
    if (rows.length === 0) return 0;
    return await fillCountryCodes(supabase, rows, options);
  } catch {
    return 0;
  }
}

/** Fill `country_code` for every place the owner has. Returns rows updated. */
export async function persistOwnerPlaceCountryCodes(
  supabase: SupabaseClient,
  ownerId: string,
  options: PersistCountryCodesOptions = {},
): Promise<number> {
  try {
    const rows = await loadUnresolvedPlaces(supabase, { ownerId });
    if (rows.length === 0) return 0;
    return await fillCountryCodes(supabase, rows, options);
  } catch {
    return 0;
  }
}

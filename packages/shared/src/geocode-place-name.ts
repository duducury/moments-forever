/**
 * Pure helpers for reverse-geocoding place labels (Nominatim / OSM).
 * I/O lives in the web app; this module never calls the network.
 */

import { isGenericLocationLabel } from "./location-name";

/** ~110 m — enough to reuse labels for the same settlement cluster. */
export const GEOCODE_CACHE_DECIMALS = 3;

/** Locality keys preferred for a travel folder name (most specific first). */
const LOCALITY_KEYS = [
  "island",
  "archipelago",
  "city",
  "town",
  "municipality",
  "village",
  "hamlet",
  "city_district",
  "suburb",
  "county",
  "state_district",
  "region",
  "state",
  "province",
] as const;

const PREFERRED_ADDRESS_TYPES = new Set([
  "island",
  "archipelago",
  "city",
  "town",
  "municipality",
  "village",
  "hamlet",
  "city_district",
  "suburb",
  "county",
  "state_district",
  "state",
  "region",
  "province",
]);

const STREET_LEVEL_TYPES = new Set([
  "road",
  "highway",
  "path",
  "pedestrian",
  "house",
  "building",
  "amenity",
  "shop",
  "office",
]);

/**
 * Common OSM English (and variants) → Portuguese country display names.
 * Nominatim may already return PT via Accept-Language; this covers leftovers.
 */
const COUNTRY_NAMES_PT: Readonly<Record<string, string>> = {
  indonesia: "Indonésia",
  brasil: "Brasil",
  brazil: "Brasil",
  "united states": "Estados Unidos",
  "united states of america": "Estados Unidos",
  usa: "Estados Unidos",
  "estados unidos": "Estados Unidos",
  portugal: "Portugal",
  spain: "Espanha",
  espana: "Espanha",
  españa: "Espanha",
  france: "França",
  italy: "Itália",
  italia: "Itália",
  germany: "Alemanha",
  deutschland: "Alemanha",
  "united kingdom": "Reino Unido",
  "great britain": "Reino Unido",
  england: "Inglaterra",
  japan: "Japão",
  china: "China",
  mexico: "México",
  méxico: "México",
  argentina: "Argentina",
  chile: "Chile",
  colombia: "Colômbia",
  peru: "Peru",
  perú: "Peru",
  uruguay: "Uruguai",
  paraguay: "Paraguai",
  bolivia: "Bolívia",
  canada: "Canadá",
  australia: "Austrália",
  "new zealand": "Nova Zelândia",
  thailand: "Tailândia",
  vietnam: "Vietnã",
  "south korea": "Coreia do Sul",
  "korea, republic of": "Coreia do Sul",
  india: "Índia",
  egypt: "Egito",
  morocco: "Marrocos",
  "south africa": "África do Sul",
  greece: "Grécia",
  turkey: "Turquia",
  türkiye: "Turquia",
  netherlands: "Países Baixos",
  belgium: "Bélgica",
  switzerland: "Suíça",
  austria: "Áustria",
  ireland: "Irlanda",
  sweden: "Suécia",
  norway: "Noruega",
  denmark: "Dinamarca",
  finland: "Finlândia",
  poland: "Polônia",
  "czech republic": "República Tcheca",
  czechia: "República Tcheca",
  croatia: "Croácia",
  hungary: "Hungria",
  romania: "Romênia",
  russia: "Rússia",
  "russian federation": "Rússia",
  "united arab emirates": "Emirados Árabes Unidos",
  uae: "Emirados Árabes Unidos",
  qatar: "Catar",
  singapore: "Singapura",
  malaysia: "Malásia",
  philippines: "Filipinas",
  "the philippines": "Filipinas",
  iceland: "Islândia",
  cuba: "Cuba",
  "dominican republic": "República Dominicana",
  "costa rica": "Costa Rica",
  panama: "Panamá",
  "new caledonia": "Nova Caledônia",
  fiji: "Fiji",
  maldives: "Maldivas",
  "sri lanka": "Sri Lanka",
  nepal: "Nepal",
  "hong kong": "Hong Kong",
  taiwan: "Taiwan",
};

export type NominatimAddress = Readonly<Record<string, string | undefined>>;

export interface NominatimReverseLike {
  readonly name?: string | null;
  readonly addresstype?: string | null;
  readonly display_name?: string | null;
  readonly address?: NominatimAddress | null;
}

export function geocodeCacheKey(
  latitude: number,
  longitude: number,
  decimals: number = GEOCODE_CACHE_DECIMALS,
): string {
  const factor = 10 ** Math.max(0, Math.min(6, decimals));
  const lat = Math.round(latitude * factor) / factor;
  const lon = Math.round(longitude * factor) / factor;
  return `${lat.toFixed(decimals)},${lon.toFixed(decimals)}`;
}

function sanitizePart(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/gu, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length > 60) return null;
  if (/,/.test(cleaned)) return null;
  if (/^\d+$/u.test(cleaned)) return null;
  if (/^\d{4,}/u.test(cleaned)) return null; // postal-ish
  if (isGenericLocationLabel(cleaned)) return null;
  return cleaned;
}

/** Prefer Portuguese country labels when we know the English OSM form. */
export function localizeCountryName(country: string): string {
  const cleaned = country.replace(/\s+/gu, " ").trim();
  if (!cleaned) return cleaned;
  const mapped = COUNTRY_NAMES_PT[cleaned.toLowerCase()];
  return mapped ?? cleaned;
}

/**
 * Preferred travel folder label: "País, Localidade".
 */
export function formatCountryLocality(
  country: string | null | undefined,
  locality: string | null | undefined,
): string | null {
  const localizedCountry = country
    ? localizeCountryName(country)
    : null;
  const safeCountry = sanitizePart(localizedCountry);
  const safeLocality = sanitizePart(locality);

  if (
    safeCountry &&
    safeLocality &&
    safeCountry.toLowerCase() !== safeLocality.toLowerCase()
  ) {
    const composite = `${safeCountry}, ${safeLocality}`;
    return composite.length <= 80 ? composite : safeLocality;
  }
  return safeLocality ?? safeCountry;
}

function pickLocality(
  result: NominatimReverseLike,
  address: NominatimAddress | null,
): string | null {
  const addressType = result.addresstype?.trim().toLowerCase() ?? "";

  if (PREFERRED_ADDRESS_TYPES.has(addressType)) {
    const fromType = sanitizePart(result.name);
    if (fromType) return fromType;
  }

  if (address) {
    for (const key of LOCALITY_KEYS) {
      const candidate = sanitizePart(address[key]);
      if (candidate) return candidate;
    }
  }

  if (STREET_LEVEL_TYPES.has(addressType)) {
    return null;
  }

  return sanitizePart(result.name);
}

/**
 * Pick a short travel-friendly place label from a Nominatim reverse payload.
 * Format: "País, Localidade" when both are available.
 */
export function pickTravelPlaceName(
  result: NominatimReverseLike | null | undefined,
): string | null {
  if (!result) return null;

  const address = result.address ?? null;
  const locality = pickLocality(result, address);
  const country = address ? sanitizePart(address.country) : null;

  return formatCountryLocality(country, locality);
}

export interface GeocodeTarget {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly confirmedByUser: boolean;
}

/**
 * Collapse many GPS points into unique cache keys (one network lookup each).
 * Targets without GPS or that cannot accept suggestions are skipped.
 */
export function collectGeocodeLookups(
  targets: readonly GeocodeTarget[],
  canApply: (place: {
    readonly name: string;
    readonly confirmedByUser: boolean;
  }) => boolean,
): readonly {
  readonly key: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly targetIds: readonly string[];
}[] {
  const buckets = new Map<
    string,
    {
      latitude: number;
      longitude: number;
      targetIds: string[];
    }
  >();

  for (const target of targets) {
    if (
      !Number.isFinite(target.latitude) ||
      !Number.isFinite(target.longitude)
    ) {
      continue;
    }
    if (
      !canApply({
        name: target.name,
        confirmedByUser: target.confirmedByUser,
      })
    ) {
      continue;
    }

    const key = geocodeCacheKey(target.latitude, target.longitude);
    const existing = buckets.get(key);
    if (existing) {
      existing.targetIds.push(target.id);
      continue;
    }
    buckets.set(key, {
      latitude: target.latitude,
      longitude: target.longitude,
      targetIds: [target.id],
    });
  }

  return [...buckets.entries()].map(([key, value]) => ({
    key,
    latitude: value.latitude,
    longitude: value.longitude,
    targetIds: value.targetIds,
  }));
}

export function applySuggestedNamesById<
  T extends { readonly id: string; readonly name: string },
>(items: readonly T[], suggestions: ReadonlyMap<string, string>): T[] {
  return items.map((item) => {
    const next = suggestions.get(item.id);
    if (!next || next === item.name) return item;
    return { ...item, name: next };
  });
}

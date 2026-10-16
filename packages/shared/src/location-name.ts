/**
 * Display and confirmation rules for place/album location names.
 *
 * Reverse geocoding (Nominatim) may write a suggested label into `places.name`
 * only when {@link canApplySuggestedPlaceName} returns true — never invent
 * names and never overwrite a user-confirmed non-generic label.
 */

const COORDINATE_SUFFIX =
  /\s·\s*-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?\s*$/u;

export function cleanLocationLabel(label: string): string {
  return label.replace(COORDINATE_SUFFIX, "").trim();
}

export function isGenericLocationLabel(label: string): boolean {
  const cleaned = cleanLocationLabel(label);
  if (!cleaned) return true;
  // Legacy import labels ("Local N") and current place fallbacks ("Lugar N").
  if (/^local\s+\d+$/iu.test(cleaned)) return true;
  if (/^lugar\s+\d+$/iu.test(cleaned)) return true;
  if (/^álbum\s+\d+$/iu.test(cleaned)) return true;
  if (/^album\s+\d+$/iu.test(cleaned)) return true;
  if (/^grupo(\s+unido)?\s+\d+$/iu.test(cleaned)) return true;
  if (/^desconhecido$/iu.test(cleaned)) return true;
  if (/local desconhecido/iu.test(cleaned)) return true;
  if (/data e local desconhecidos/iu.test(cleaned)) return true;
  if (/^data\s+\d{4}-\d{2}-\d{2}/iu.test(cleaned)) return true;
  if (/^nova viagem$/iu.test(cleaned)) return true;
  return false;
}

/**
 * True when a future geocoding job may overwrite `places.name`.
 * User-confirmed non-generic names must never be replaced.
 */
export function canApplySuggestedPlaceName(place: {
  readonly name: string;
  readonly confirmedByUser: boolean;
}): boolean {
  if (!place.confirmedByUser) return true;
  return isGenericLocationLabel(place.name);
}

/**
 * Resolve the label shown in UI:
 * 1. User-confirmed place name
 * 2. Non-generic album name (rename)
 * 3. Automatic suggested place name (reverse geocoding)
 * 4. Fallback "Lugar N" / stored generic label (also accepts legacy "Local N")
 */
export function resolveLocationDisplayName(input: {
  readonly albumName: string;
  readonly placeName?: string | null;
  readonly placeConfirmedByUser?: boolean;
  readonly fallbackIndex?: number;
}): string {
  const place = input.placeName ? cleanLocationLabel(input.placeName) : "";
  const album = cleanLocationLabel(input.albumName);
  const confirmed = Boolean(input.placeConfirmedByUser);

  if (confirmed && place && !isGenericLocationLabel(place)) {
    return coarsenTravelLabel(place);
  }

  if (album && !isGenericLocationLabel(album)) {
    return coarsenTravelLabel(album);
  }

  if (place && !isGenericLocationLabel(place)) {
    return coarsenTravelLabel(place);
  }

  if (album) return coarsenTravelLabel(album);
  if (place) return coarsenTravelLabel(place);
  return `Lugar ${input.fallbackIndex ?? 1}`;
}

/** OSM villages that should display as the travel destination people recognize. */
const TRAVEL_LABEL_ALIASES: Readonly<Record<string, string>> = {
  "kesiman kertalangu": "Bali",
  kesiman: "Bali",
  "denpasar timur": "Bali",
  denpasar: "Bali",
};

function foldLabelKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Districts that people know by their city: "Deira" is Dubai. Keyed by the folded district name, and only applied when
 * the label's country part matches, so the same name elsewhere is never rewritten.
 */
const DISTRICT_CITIES: ReadonlyMap<
  string,
  { readonly country: string; readonly city: string }
> = new Map(
  [
    ["deira", "Dubai"],
    ["bur dubai", "Dubai"],
    ["jumeirah", "Dubai"],
    ["jumeira", "Dubai"],
    ["business bay", "Dubai"],
    ["al barsha", "Dubai"],
  ].map(([district, city]) => [
    district as string,
    { country: "emirados arabes unidos", city: city as string },
  ]),
);

function districtToCity(label: string): string | null {
  const comma = label.indexOf(",");
  if (comma <= 0) return null;
  const first = label.slice(0, comma).trim();
  const second = label.slice(comma + 1).trim();
  const pairs: readonly [string, string, boolean][] = [
    [first, second, true],
    [second, first, false],
  ];
  for (const [country, locality, countryFirst] of pairs) {
    const entry = DISTRICT_CITIES.get(foldLabelKey(locality));
    if (entry && foldLabelKey(country) === entry.country) {
      return countryFirst ? `${country}, ${entry.city}` : `${entry.city}, ${country}`;
    }
  }
  return null;
}

export function coarsenTravelLabel(label: string): string {
  const cleaned = cleanLocationLabel(label);
  const district = districtToCity(cleaned);
  if (district) return district;
  const fullKey = foldLabelKey(cleaned);
  if (TRAVEL_LABEL_ALIASES[fullKey]) return TRAVEL_LABEL_ALIASES[fullKey];
  if (fullKey.includes("kesiman")) return "Bali";

  const comma = cleaned.indexOf(",");
  if (comma > 0) {
    const localityKey = foldLabelKey(cleaned.slice(comma + 1));
    const alias = TRAVEL_LABEL_ALIASES[localityKey];
    if (alias) return alias;
    if (localityKey.includes("kesiman")) return "Bali";
    const countryKey = foldLabelKey(cleaned.slice(0, comma));
    const countryAlias = TRAVEL_LABEL_ALIASES[countryKey];
    if (countryAlias) return countryAlias;
  }
  return cleaned;
}

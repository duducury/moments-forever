import { placeLabelCityFirst } from "@moments-forever/shared";

/**
 * Destination-aware data for the decorative travel stamp in "Sobre essa viagem".
 *
 * A landmark silhouette is used ONLY when the destination city is recognised with certainty (exact city name or a
 * known district of it in the right country, accent- and case-insensitive; or the photos' GPS centre inside the city). Anything else gets the generic compass stamp, so no
 * unrelated or invented symbol is ever shown. To support another city, add an entry whose silhouette is drawn in
 * `trip-stamp.tsx` for the same `kind`.
 */
export type StampLandmark = "burj-khalifa" | "eiffel-tower" | "big-ben";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** City name -> its landmark and country. When the destination country is known and differs, there is no match. */
const CITY_LANDMARKS: ReadonlyMap<
  string,
  { readonly landmark: StampLandmark; readonly country: string }
> = new Map([
  ["dubai", { landmark: "burj-khalifa", country: "AE" }],
  ["paris", { landmark: "eiffel-tower", country: "FR" }],
  ["londres", { landmark: "big-ben", country: "GB" }],
  ["london", { landmark: "big-ben", country: "GB" }],
]);

/**
 * Unambiguous districts of those cities. Each alias only counts when the destination country matches, so e.g. a
 * "Soho" in another country never gets London's tower.
 */
const DISTRICT_ALIASES: readonly {
  readonly country: string;
  readonly landmark: StampLandmark;
  readonly names: readonly string[];
}[] = [
  {
    country: "AE",
    landmark: "burj-khalifa",
    names: ["deira", "bur dubai", "jumeirah", "jumeira", "business bay", "al barsha"],
  },
  {
    country: "FR",
    landmark: "eiffel-tower",
    names: ["montmartre", "le marais", "marais", "saint germain des pres", "quartier latin"],
  },
  {
    country: "GB",
    landmark: "big-ben",
    names: ["westminster", "soho", "camden", "shoreditch", "kensington"],
  },
];

/** Urban bounding boxes (degrees). The place's GPS centre inside one of them is a reliable match on its own. */
const CITY_BOXES: readonly {
  readonly landmark: StampLandmark;
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}[] = [
  { landmark: "burj-khalifa", south: 24.78, north: 25.32, west: 54.88, east: 55.6 },
  { landmark: "eiffel-tower", south: 48.8, north: 48.92, west: 2.22, east: 2.47 },
  { landmark: "big-ben", south: 51.4, north: 51.62, west: -0.28, east: 0.05 },
];

function landmarkFromSegment(
  key: string,
  countryCode: string | null,
): StampLandmark | null {
  if (!key) return null;
  const words = key.split(" ");
  const first = words[0] ?? "";
  // A known city by exact name, or as the first word of a short place name ("Dubai Marina").
  const city =
    CITY_LANDMARKS.get(key) ??
    (words.length <= 3 ? CITY_LANDMARKS.get(first) : undefined);
  if (city) {
    // "Paris, Texas" is not Paris: a known, different country cancels the match.
    return countryCode && countryCode !== city.country ? null : city.landmark;
  }
  if (countryCode) {
    for (const entry of DISTRICT_ALIASES) {
      if (entry.country === countryCode && entry.names.includes(key)) {
        return entry.landmark;
      }
    }
  }
  return null;
}

/**
 * The landmark for a destination, or null (generic outline/compass). Decided by, in order: a candidate name (each
 * comma-separated part is checked: a known city, or one of its districts in the right country) and then the GPS centre
 * of the place's photos falling inside a known city. Never a guess.
 */
export function stampLandmark(
  candidates: readonly (string | null | undefined)[],
  options?: {
    readonly countryCode?: string | null;
    readonly coordinates?: {
      readonly latitude: number;
      readonly longitude: number;
    } | null;
  },
): StampLandmark | null {
  const countryCode = options?.countryCode?.trim().toUpperCase() || null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const part of candidate.split(",")) {
      const found = landmarkFromSegment(normalize(part), countryCode);
      if (found) return found;
    }
  }
  const at = options?.coordinates;
  if (at && Number.isFinite(at.latitude) && Number.isFinite(at.longitude)) {
    for (const box of CITY_BOXES) {
      if (
        at.latitude >= box.south &&
        at.latitude <= box.north &&
        at.longitude >= box.west &&
        at.longitude <= box.east
      ) {
        return box.landmark;
      }
    }
  }
  return null;
}

/** Text shown on the stamp: the city (or place) in capitals, shortened when long; the country as a second line. */
export function stampLabels(input: {
  readonly city: string | null | undefined;
  readonly place: string;
  readonly country: string | null | undefined;
}): { readonly name: string; readonly country: string } {
  const clip = (value: string, max: number) => {
    const text = value.trim().replace(/\s+/gu, " ").toLocaleUpperCase("pt-BR");
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  };
  // A place title is "Cidade, País" (or a legacy "País, Localidade"): the stamp prints only the city part.
  const placeCity = placeLabelCityFirst(input.place).split(",")[0] ?? input.place;
  const name = clip(input.city?.trim() || placeCity, 18);
  const country = clip(input.country ?? "", 24);
  return { name, country: country === name ? "" : country };
}

/**
 * Which real outline the stamp can draw for a destination: the US state when it is known, otherwise the country.
 * Outlines come from `public/geo/stamp-shapes-v1.json` (built from the repo's own country/state data).
 */
export function stampShapeKey(
  countryCode: string | null | undefined,
  usState: string | null | undefined,
): { readonly kind: "us-state" | "country"; readonly key: string } | null {
  const country = countryCode?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/u.test(country)) return null;
  const state = usState?.trim().toUpperCase() ?? "";
  if (country === "US" && /^[A-Z]{2}$/u.test(state)) {
    return { kind: "us-state", key: state };
  }
  return { kind: "country", key: country };
}

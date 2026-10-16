/**
 * Destination-aware data for the decorative travel stamp in "Sobre essa viagem".
 *
 * A landmark silhouette is used ONLY when the destination city is recognised with certainty (exact city name,
 * accent- and case-insensitive, in Portuguese or the local name). Anything else gets the generic compass stamp, so no
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

const CITY_LANDMARKS: ReadonlyMap<string, StampLandmark> = new Map([
  ["dubai", "burj-khalifa"],
  ["paris", "eiffel-tower"],
  ["londres", "big-ben"],
  ["london", "big-ben"],
]);

/** The first candidate that is exactly a known city decides the landmark; otherwise null (generic compass). */
export function stampLandmark(
  candidates: readonly (string | null | undefined)[],
): StampLandmark | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = normalize(candidate);
    const exact = CITY_LANDMARKS.get(key);
    if (exact) return exact;
    // "Dubai Marina" / "Paris 15e": a known city as the first word of a short place name.
    const first = key.split(" ")[0] ?? "";
    if (key.split(" ").length <= 3 && CITY_LANDMARKS.has(first)) {
      return CITY_LANDMARKS.get(first) ?? null;
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
  const name = clip(input.city?.trim() || input.place, 18);
  const country = clip(input.country ?? "", 24);
  return { name, country: country === name ? "" : country };
}

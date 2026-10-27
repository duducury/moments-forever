import { countryNameFromCode, isCountryNameOf } from "@moments-forever/shared";

export interface LightboxHeading {
  /** Large line: the country or territory ("Porto Rico"), else the place / trip. */
  readonly title: string;
  /** Second line: the route or place without the country ("San Juan → Vieques → Culebra"), or null. */
  readonly subtitle: string | null;
}

/**
 * Header text of the photo viewer. Pure: the country comes from the destination's ISO code (so the name, the flag
 * and the code always agree), and the second line is the folder / trip label with the country part removed.
 */
export function lightboxHeading(input: {
  readonly countryCode: string | null;
  readonly albumLabel: string | null;
  readonly experienceTitle: string | null;
  readonly placeLabel: string | null;
}): LightboxHeading {
  const countryCode = input.countryCode?.trim().toUpperCase() || null;
  const countryName = countryCode ? countryNameFromCode(countryCode) : null;
  const clean = (value: string | null): string | null => value?.replace(/\s+/gu, " ").trim() || null;
  const album = clean(input.albumLabel);
  const trip = clean(input.experienceTitle);
  const place = clean(input.placeLabel);

  const withoutCountry = (label: string | null): string | null => {
    if (!label) return null;
    const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
    const rest = countryCode
      ? parts.filter((part) => !isCountryNameOf(part, countryCode))
      : parts;
    const joined = rest.join(", ");
    return joined || null;
  };

  if (countryName) {
    const route = withoutCountry(album) ?? withoutCountry(place) ?? withoutCountry(trip);
    return { title: countryName, subtitle: route && route !== countryName ? route : null };
  }

  const title = place ?? album ?? trip ?? "Momento";
  const subtitle = [album, trip].find((candidate) => candidate && candidate !== title) ?? null;
  return { title, subtitle };
}

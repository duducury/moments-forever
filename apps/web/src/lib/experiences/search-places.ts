import { placeYear } from "./place-years";

interface SearchablePlace {
  readonly title: string;
  readonly experienceTitle: string;
  readonly countryCode: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

/** Lower-case, accent-free text so "sao paulo" finds "São Paulo". */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trips matching what the owner typed. Every word must match somewhere in the
 * trip's name, its parent trip title, country code or start year, so
 * "italia 2024" narrows down while a half-typed word still finds things.
 * An empty query returns the list unchanged.
 */
export function filterPlacesByQuery<T extends SearchablePlace>(
  places: readonly T[],
  query: string,
): readonly T[] {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return places;
  return places.filter((place) => {
    const haystack = normalizeSearchText(
      [
        place.title,
        place.experienceTitle,
        place.countryCode ?? "",
        String(placeYear(place) ?? ""),
      ].join(" "),
    );
    return words.every((word) => haystack.includes(word));
  });
}

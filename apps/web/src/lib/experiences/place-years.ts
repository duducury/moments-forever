/** The profile's year filter for trips. A trip belongs to the year it started (or ended, if that's all we know). */

export type PlaceYearFilter = "all" | "none" | number;

interface DatedPlace {
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

/** Calendar year from an ISO date string, read from the text so time zones can't shift it. */
export function placeYear(place: DatedPlace): number | null {
  const iso = place.startsAt ?? place.endsAt;
  if (!iso) return null;
  const year = Number(iso.slice(0, 4));
  return Number.isInteger(year) && year >= 1800 && year <= 3000 ? year : null;
}

/** Years that have trips, most recent first, and whether some trips have no date at all. */
export function placeYearOptions(places: readonly DatedPlace[]): {
  readonly years: readonly number[];
  readonly hasUndated: boolean;
} {
  const years = new Set<number>();
  let hasUndated = false;
  for (const place of places) {
    const year = placeYear(place);
    if (year === null) hasUndated = true;
    else years.add(year);
  }
  return { years: [...years].sort((a, b) => b - a), hasUndated };
}

export function filterPlacesByYear<T extends DatedPlace>(
  places: readonly T[],
  filter: PlaceYearFilter,
): readonly T[] {
  if (filter === "all") return places;
  if (filter === "none") return places.filter((p) => placeYear(p) === null);
  return places.filter((p) => placeYear(p) === filter);
}

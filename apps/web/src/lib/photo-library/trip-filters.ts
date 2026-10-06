/**
 * The filter chips of the "Encontramos viagens" list: Todas · Novas · <main country> · Outros.
 * Pure: chips only narrow what is SHOWN — what is ticked, reviewed or imported is untouched.
 */

import type { Candidate } from "./selection";

export type TripFilterId = "all" | "new" | "other" | `country:${string}`;

export interface TripFilterChip {
  readonly id: TripFilterId;
  readonly label: string;
  readonly count: number;
  /** Flag to show on the chip (the country chip). */
  readonly countryCode: string | null;
}

/** The country a candidate is known to be in, even before its city name has loaded. */
export function candidateCountry(candidate: Candidate): string | null {
  return candidate.countryCode ?? candidate.quickCountryCode ?? null;
}

export function countryChipLabel(code: string, regionNames?: Intl.DisplayNames): string {
  if (code === "US") return "EUA";
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * A chip that would show every trip adds nothing, so it is left out; the row itself is
 * left out when only "Todas" would remain.
 */
export function buildFilterChips(
  candidates: readonly Candidate[],
  regionNames?: Intl.DisplayNames,
): readonly TripFilterChip[] {
  const total = candidates.length;
  const chips: TripFilterChip[] = [{ id: "all", label: "Todas", count: total, countryCode: null }];
  if (total === 0) return chips;

  const fresh = candidates.filter((candidate) => candidate.kind === "new").length;
  if (fresh > 0 && fresh < total) chips.push({ id: "new", label: "Novas", count: fresh, countryCode: null });

  const perCountry = new Map<string, number>();
  for (const candidate of candidates) {
    const country = candidateCountry(candidate);
    if (country) perCountry.set(country, (perCountry.get(country) ?? 0) + 1);
  }
  let main: string | null = null;
  for (const [country, count] of perCountry) {
    if (main === null || count > (perCountry.get(main) as number)) main = country;
  }
  if (main !== null) {
    const inMain = perCountry.get(main) as number;
    if (inMain < total) {
      chips.push({
        id: `country:${main}`,
        label: countryChipLabel(main, regionNames),
        count: inMain,
        countryCode: main,
      });
      chips.push({ id: "other", label: "Outros", count: total - inMain, countryCode: null });
    }
  }
  return chips.length > 1 ? chips : [];
}

export function applyFilter(
  candidates: readonly Candidate[],
  filter: TripFilterId,
  mainCountry: string | null,
): readonly Candidate[] {
  if (filter === "all") return candidates;
  if (filter === "new") return candidates.filter((candidate) => candidate.kind === "new");
  if (filter === "other") {
    return candidates.filter((candidate) => candidateCountry(candidate) !== mainCountry);
  }
  const code = filter.slice("country:".length);
  return candidates.filter((candidate) => candidateCountry(candidate) === code);
}

/** The country behind a `country:XX` chip, if the row has one. */
export function mainCountryOf(chips: readonly TripFilterChip[]): string | null {
  return chips.find((chip) => chip.id.startsWith("country:"))?.countryCode ?? null;
}

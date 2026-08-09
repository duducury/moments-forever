/**
 * Display helpers for the trip hero — presentation only.
 * Does not invent geography; only reuses title / primary_* / place labels.
 */

import {
  cleanLocationLabel,
  isGenericLocationLabel,
} from "@moments-forever/shared";

import type { TripAlbum, TripExperience } from "./album-types";

export interface TripHeroDisplay {
  /** Small uppercase label on the cover (e.g. BALI). */
  readonly eyebrow: string | null;
  /** Large title (e.g. Bali 2026). */
  readonly title: string;
  /** Date line without repeating the title year when possible. */
  readonly dateLine: string;
}

function isGenericTripTitle(title: string): boolean {
  const cleaned = cleanLocationLabel(title);
  if (!cleaned) return true;
  if (/^nova viagem$/iu.test(cleaned)) return true;
  if (/^viagem\s+\d{4}$/iu.test(cleaned)) return true;
  if (isGenericLocationLabel(cleaned)) return true;
  return false;
}

function yearFromIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
}

function titleContainsYear(title: string, year: number): boolean {
  return new RegExp(`(?:^|\\D)${year}(?:\\D|$)`, "u").test(title);
}

function parsePlaceParts(label: string): {
  readonly country: string | null;
  readonly locality: string | null;
} {
  const cleaned = cleanLocationLabel(label);
  if (!cleaned || isGenericLocationLabel(cleaned)) {
    return { country: null, locality: null };
  }
  const comma = cleaned.indexOf(",");
  if (comma > 0) {
    const country = cleaned.slice(0, comma).trim();
    const locality = cleaned.slice(comma + 1).trim();
    return {
      country: country || null,
      locality: locality || null,
    };
  }
  return { country: null, locality: cleaned };
}

/**
 * Best geographic label already present on the experience or its places.
 * Never invents a place that is not in the data.
 */
export function deriveTripGeography(input: {
  readonly primaryCity: string | null;
  readonly primaryCountry: string | null;
  readonly placeLabels: readonly string[];
}): { readonly eyebrow: string | null; readonly placeName: string | null } {
  const city = input.primaryCity?.trim() ?? "";
  const country = input.primaryCountry?.trim() ?? "";

  if (city && !isGenericLocationLabel(city)) {
    return { eyebrow: city, placeName: city };
  }
  if (country && !isGenericLocationLabel(country)) {
    return { eyebrow: country, placeName: country };
  }

  const parsed = input.placeLabels
    .map(parsePlaceParts)
    .filter((part) => part.locality || part.country);

  if (parsed.length === 0) {
    return { eyebrow: null, placeName: null };
  }

  const localities = [
    ...new Set(
      parsed
        .map((part) => part.locality)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const countries = [
    ...new Set(
      parsed
        .map((part) => part.country)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  if (localities.length === 1 && localities[0]) {
    return { eyebrow: localities[0], placeName: localities[0] };
  }

  if (countries.length === 1 && countries[0] && localities.length > 1) {
    return { eyebrow: countries[0], placeName: countries[0] };
  }

  if (countries.length === 1 && countries[0]) {
    return { eyebrow: countries[0], placeName: countries[0] };
  }

  if (localities.length === 1 && localities[0]) {
    return { eyebrow: localities[0], placeName: localities[0] };
  }

  return { eyebrow: null, placeName: null };
}

function withYearOnce(base: string, year: number | null): string {
  if (!year) return base;
  if (titleContainsYear(base, year)) return base;
  return `${base} ${year}`;
}

/**
 * Compact trip date range: omit year when start/end share the same year
 * (year already shown in the hero title). Cross-year ranges keep both years.
 */
export function formatTripHeroDateRange(
  startsAt: string | null,
  endsAt: string | null,
): string {
  if (!startsAt && !endsAt) {
    return "Período não informado";
  }

  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const startOk = start && Number.isFinite(start.getTime()) ? start : null;
  const endOk = end && Number.isFinite(end.getTime()) ? end : null;

  if (!startOk && !endOk) {
    return "Período não informado";
  }

  const single = startOk ?? endOk!;
  const startYear = startOk?.getFullYear() ?? null;
  const endYear = endOk?.getFullYear() ?? null;
  const sameYear =
    startYear !== null && endYear !== null
      ? startYear === endYear
      : true;

  const dayMonth = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
  });
  const dayMonthYear = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (startOk && endOk) {
    if (startOk.toDateString() === endOk.toDateString()) {
      return sameYear ? dayMonth.format(startOk) : dayMonthYear.format(startOk);
    }
    if (sameYear) {
      return `${dayMonth.format(startOk)} — ${dayMonth.format(endOk)}`;
    }
    return `${dayMonthYear.format(startOk)} — ${dayMonthYear.format(endOk)}`;
  }

  return sameYear ? dayMonth.format(single) : dayMonthYear.format(single);
}

export function buildTripHeroDisplay(
  experience: Pick<
    TripExperience,
    "title" | "startsAt" | "endsAt" | "primaryCity" | "primaryCountry"
  >,
  albums: readonly TripAlbum[],
): TripHeroDisplay {
  const rootLabels = albums
    .filter((album) => album.parentAlbumId === null)
    .map((album) => album.displayName);

  const geography = deriveTripGeography({
    primaryCity: experience.primaryCity,
    primaryCountry: experience.primaryCountry,
    placeLabels: rootLabels,
  });

  const year =
    yearFromIso(experience.startsAt) ?? yearFromIso(experience.endsAt);

  const manualTitle = experience.title.trim();
  const useManual = Boolean(manualTitle) && !isGenericTripTitle(manualTitle);

  let title: string;
  let eyebrow: string | null = geography.eyebrow;

  if (useManual) {
    title = withYearOnce(manualTitle, year);
    // If the manual title already is/contains the geo name, still show eyebrow.
    if (!eyebrow && !isGenericTripTitle(manualTitle)) {
      // Strip trailing year for a short eyebrow when possible.
      const withoutYear = year
        ? manualTitle.replace(new RegExp(`\\s*${year}\\s*$`, "u"), "").trim()
        : manualTitle;
      eyebrow = withoutYear || null;
    }
  } else if (geography.placeName) {
    title = withYearOnce(geography.placeName, year);
  } else {
    title = manualTitle || "Viagem";
  }

  return {
    eyebrow,
    title,
    dateLine: formatTripHeroDateRange(experience.startsAt, experience.endsAt),
  };
}

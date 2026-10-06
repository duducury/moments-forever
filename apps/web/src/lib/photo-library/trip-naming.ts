/**
 * How a discovered trip is presented: by its PLACE, never by a made-up name.
 *
 *  - 3+ GPS photos, place resolved → "New York", "Paris → Versailles"
 *  - place still loading           → pending: the offline state/country ("CT, USA") when known,
 *                                    otherwise a placeholder — never a guessed city
 *  - GPS, place not found          → "Local não identificado"
 *  - 1–2 GPS photos / none         → "Possível viagem" + a note that the location is
 *                                    limited (never a place, a flag or a made-up name)
 *
 * `name` is what the new trip is called if the person confirms ("País, Local",
 * the same format the rest of the app uses so flags and the passport work).
 */

import {
  countryCodeFromName,
  countryCodeFromPlaceLabel,
} from "@moments-forever/shared";

import type { QuickPlace } from "./quick-place";
import type { LocationQuality, TripStop } from "./types";

export type TitleState = "named" | "pending" | "unnamed" | "possible";

export interface TripDescription {
  /** What the list shows: the places, joined with " → ". While pending: the offline state/country, or empty. */
  readonly title: string;
  /** Default name for a new trip: "País, Local → Local". */
  readonly name: string;
  readonly countryCode: string | null;
  readonly state: TitleState;
  /** Shown under the dates for a "possible trip": why there is no place. */
  readonly locationNote: string | null;
}

export const POSSIBLE_TRIP_TITLE = "Possível viagem";
export const LIMITED_LOCATION_NOTE = "Localização limitada";
export const NO_LOCATION_NOTE = "Sem localização nas fotos";
export const UNNAMED_PLACE_TITLE = "Local não identificado";

/** "País, Localidade" → its two parts (a lone token is a locality, unless it is a country name). */
export function parsePlaceLabel(label: string): {
  readonly country: string | null;
  readonly locality: string | null;
} {
  const cleaned = label.trim();
  if (!cleaned) return { country: null, locality: null };
  const comma = cleaned.indexOf(",");
  if (comma > 0) {
    return {
      country: cleaned.slice(0, comma).trim() || null,
      locality: cleaned.slice(comma + 1).trim() || null,
    };
  }
  return countryCodeFromName(cleaned)
    ? { country: cleaned, locality: null }
    : { country: null, locality: cleaned };
}

export function describeTrip(input: {
  readonly stops: readonly TripStop[];
  /** How much GPS backs the trip; anything but "located" is never given a place. */
  readonly locationQuality: LocationQuality;
  /** Reverse-geocoded (or offline-fallback) place per stop id. */
  readonly labels: Readonly<Record<string, string | undefined>>;
  /** Stops whose lookup is finished, whether or not it found a name. */
  readonly settled: ReadonlySet<string>;
  /** Instant offline "CT, USA" per stop id, shown only while the real place is still loading. */
  readonly quick?: Readonly<Record<string, QuickPlace | undefined>>;
}): TripDescription {
  const { stops, labels, settled, locationQuality, quick = {} } = input;
  if (locationQuality !== "located" || stops.length === 0) {
    return {
      title: POSSIBLE_TRIP_TITLE,
      // Left empty on purpose: the person names it (or not) at the review step.
      name: "",
      countryCode: null,
      state: "possible",
      locationNote:
        locationQuality === "limited" ? LIMITED_LOCATION_NOTE : NO_LOCATION_NOTE,
    };
  }

  const waiting = stops.some((stop) => labels[stop.id] === undefined && !settled.has(stop.id));
  if (waiting) {
    const early: string[] = [];
    for (const stop of stops) {
      const label = quick[stop.id]?.label;
      if (label && !early.includes(label)) early.push(label);
    }
    // countryCode stays null while pending: matching against existing trips must not
    // change just because an early label showed up.
    return { title: early.join(" → "), name: "", countryCode: null, state: "pending", locationNote: null };
  }

  const localities: string[] = [];
  let firstLabel: string | null = null;
  let firstCountry: string | null = null;
  for (const stop of stops) {
    const label = labels[stop.id];
    if (!label) continue;
    const parsed = parsePlaceLabel(label);
    const locality = parsed.locality ?? parsed.country;
    if (!locality) continue;
    if (firstLabel === null) {
      firstLabel = label;
      firstCountry = parsed.country;
    }
    if (!localities.some((known) => known.toLowerCase() === locality.toLowerCase())) {
      localities.push(locality);
    }
  }

  if (localities.length === 0) {
    return {
      title: UNNAMED_PLACE_TITLE,
      name: UNNAMED_PLACE_TITLE,
      countryCode: null,
      state: "unnamed",
      locationNote: null,
    };
  }

  const title = localities.join(" → ");
  const countryOnly = firstCountry !== null && localities[0] === firstCountry;
  return {
    title,
    name: firstCountry && !countryOnly ? `${firstCountry}, ${title}` : title,
    countryCode: countryCodeFromPlaceLabel(firstLabel),
    state: "named",
    locationNote: null,
  };
}

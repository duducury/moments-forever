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
  /** Offline "CT, USA" of the trip's stops (all of them, de-duplicated) — shown from the first moment. */
  readonly placeLabel: string | null;
  /** Country of the offline label, for flags and filters while the real place is still loading. */
  readonly quickCountryCode: string | null;
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
  /**
   * Instant offline place per stop id ("CT, USA", plus the city when a listed one is right there).
   * A label already shown is never replaced by a less specific one: the geocoder only fills in
   * what is missing (see `localityOf`).
   */
  readonly quick?: Readonly<Record<string, QuickPlace | undefined>>;
}): TripDescription {
  const { stops, labels, settled, locationQuality, quick = {} } = input;

  const earlyLabels: string[] = [];
  let quickCountryCode: string | null = null;
  for (const stop of stops) {
    const place = quick[stop.id];
    if (!place) continue;
    if (!earlyLabels.includes(place.label)) earlyLabels.push(place.label);
    quickCountryCode ??= place.countryCode;
  }
  const early = {
    placeLabel: locationQuality === "located" && earlyLabels.length > 0 ? earlyLabels.join(" · ") : null,
    quickCountryCode: locationQuality === "located" ? quickCountryCode : null,
  };

  if (locationQuality !== "located" || stops.length === 0) {
    return {
      title: POSSIBLE_TRIP_TITLE,
      // Left empty on purpose: the person names it (or not) at the review step.
      name: "",
      countryCode: null,
      state: "possible",
      locationNote:
        locationQuality === "limited" ? LIMITED_LOCATION_NOTE : NO_LOCATION_NOTE,
      ...early,
    };
  }

  const waiting = stops.some((stop) => labels[stop.id] === undefined && !settled.has(stop.id));
  if (waiting) {
    // The title is the local city when EVERY stop has one (so it never has to change later);
    // otherwise a placeholder while the "CT, USA" pill already shows where it was.
    // countryCode stays null while pending: matching against existing trips must not
    // change just because an early label showed up.
    const earlyCities: string[] = [];
    for (const stop of stops) {
      const city = quick[stop.id]?.city;
      if (city && !earlyCities.some((known) => known.toLowerCase() === city.toLowerCase())) {
        earlyCities.push(city);
      }
    }
    const allHaveCity = stops.every((stop) => Boolean(quick[stop.id]?.city));
    return {
      title: allHaveCity ? earlyCities.join(" → ") : "",
      name: "",
      countryCode: null,
      state: "pending",
      locationNote: null,
      ...early,
    };
  }

  const localities: string[] = [];
  let firstLabel: string | null = null;
  let firstCountry: string | null = null;
  let usedEarly = false;
  for (const stop of stops) {
    const label = labels[stop.id];
    const place = quick[stop.id];
    const parsed = label ? parsePlaceLabel(label) : { country: null, locality: null };
    // Most specific first: the local city (already on screen) > the geocoder's city >
    // the local state/country ("NY, USA") > a bare country. Never a step down.
    let locality = place?.city ?? parsed.locality;
    if (!locality && place?.label) {
      locality = place.label;
      usedEarly = true;
    }
    locality ??= parsed.country;
    if (!locality) continue;
    if (firstLabel === null && label) {
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
      ...early,
    };
  }

  const title = localities.join(" → ");
  const countryOnly = firstCountry !== null && localities[0] === firstCountry;
  return {
    title,
    name: firstCountry && !countryOnly && !usedEarly ? `${firstCountry}, ${title}` : title,
    countryCode: countryCodeFromPlaceLabel(firstLabel) ?? early.quickCountryCode,
    state: "named",
    locationNote: null,
    ...early,
  };
}

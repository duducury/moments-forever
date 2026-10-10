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
  countryNameFromCode,
  usStateNameFromCode,
} from "@moments-forever/shared";

import { distanceKm } from "./geo";
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

/** A stop this close to a listed city of the same trip is listed right after that city. */
const NEARBY_STOP_KM = 60;

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

interface StopPlace {
  readonly country: string | null;
  readonly place: string | null;
  readonly hasKnownCity: boolean;
  readonly center: TripStop["center"];
}

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.,]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

/** The city IS the state ("Nova York" in New York, Washington D.C.): the state would only repeat it. */
function cityIsTheState(city: string, stateCode: string, stateName: string): boolean {
  const key = fold(city);
  if (key === fold(stateName)) return true;
  if (stateCode === "NY") return ["nova york", "nova iorque", "new york city", "cidade de nova york"].includes(key);
  if (stateCode === "DC") return key.startsWith("washington");
  return false;
}

/**
 * One stop's country, city and (US) state, each from the most specific source available.
 * Reliable offline information (the country, the US state) is always a fallback: a stop the
 * geocoder could not name is still never "unidentified" when the offline place knows where it is.
 */
function stopPlaceOf(stop: TripStop, label: string | undefined, quickPlace: QuickPlace | undefined): StopPlace {
  const parsed = label ? parsePlaceLabel(label) : { country: null, locality: null };
  const country =
    parsed.country ?? (quickPlace?.countryCode ? countryNameFromCode(quickPlace.countryCode) : null);
  // "PA, USA" (offline) → Pennsylvania: two different US trips never end up with the same name.
  const stateCode = quickPlace?.countryCode === "US" ? quickPlace.label.split(",")[0]!.trim().toUpperCase() : null;
  const stateName = usStateNameFromCode(stateCode);
  const city = quickPlace?.city ?? parsed.locality;
  let place: string | null;
  if (city && stateCode && stateName) {
    // "New York" / "Washington, DC" keep the state recognisable; other cities read "Filadélfia, Pennsylvania".
    place = cityIsTheState(city, stateCode, stateName)
      ? stateCode === "DC"
        ? "Washington, DC"
        : stateName
      : `${city}, ${stateName}`;
  } else {
    place = city ?? stateName ?? parsed.country ?? country;
  }
  return { country, place, hasKnownCity: Boolean(quickPlace?.city), center: stop.center };
}

/**
 * Every stop is kept. A small town beside the trip's main (listed) city is only ordered right
 * after it ("Paris → Versailles", even if Versailles was visited first): the main city leads.
 */
function mainCityFirst(stopPlaces: readonly StopPlace[]): StopPlace[] {
  const mains = stopPlaces.filter((entry) => entry.hasKnownCity);
  const mainOf = (entry: StopPlace): StopPlace | null => {
    if (entry.hasKnownCity) return null;
    let best: StopPlace | null = null;
    let bestKm = NEARBY_STOP_KM;
    for (const main of mains) {
      const km = distanceKm(main.center, entry.center);
      if (km <= bestKm) {
        best = main;
        bestKm = km;
      }
    }
    return best;
  };
  const ordered: StopPlace[] = [];
  for (const entry of stopPlaces) {
    if (entry.hasKnownCity) {
      ordered.push(entry, ...stopPlaces.filter((other) => mainOf(other) === entry));
    } else if (!mainOf(entry)) {
      ordered.push(entry);
    }
  }
  return ordered;
}

/** "País — Cidade" for the list, "País, Cidade" for the trip's name (the format the whole app reads). */
function composeTripText(stopPlaces: readonly StopPlace[]): { title: string; name: string } | null {
  const ordered = mainCityFirst(stopPlaces.filter((entry) => entry.place));
  const places: string[] = [];
  for (const entry of ordered) {
    if (!places.some((known) => fold(known) === fold(entry.place!))) places.push(entry.place!);
  }
  if (places.length === 0) return null;
  const country = ordered[0]?.country ?? null;
  const countryOnly = country !== null && fold(places[0]!) === fold(country);
  const where = places.join(" → ");
  return countryOnly || !country
    ? { title: where, name: where }
    : { title: `${country} — ${where}`, name: `${country}, ${where}` };
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
    const allHaveCity = stops.every((stop) => Boolean(quick[stop.id]?.city));
    const earlyText = allHaveCity
      ? composeTripText(stops.map((stop) => stopPlaceOf(stop, undefined, quick[stop.id])))
      : null;
    return {
      title: earlyText?.title ?? "",
      name: "",
      countryCode: null,
      state: "pending",
      locationNote: null,
      ...early,
    };
  }

  const stopPlaces = stops.map((stop) => stopPlaceOf(stop, labels[stop.id], quick[stop.id]));
  const text = composeTripText(stopPlaces);
  if (!text) {
    return {
      title: UNNAMED_PLACE_TITLE,
      name: UNNAMED_PLACE_TITLE,
      countryCode: null,
      state: "unnamed",
      locationNote: null,
      ...early,
    };
  }
  const firstLabel = stops.map((stop) => labels[stop.id]).find((label) => Boolean(label)) ?? null;
  return {
    title: text.title,
    name: text.name,
    countryCode: countryCodeFromPlaceLabel(firstLabel) ?? early.quickCountryCode,
    state: "named",
    locationNote: null,
    ...early,
  };
}

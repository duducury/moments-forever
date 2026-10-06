import type { ExistingTrip, LibraryAsset } from "./types";

export const HOME = { latitude: -23.55, longitude: -46.63 };
export const PARIS = { latitude: 48.8566, longitude: 2.3522 };
export const ROME = { latitude: 41.9028, longitude: 12.4964 };
export const CANCUN = { latitude: 21.1619, longitude: -86.8515 };

let counter = 0;

export function asset(
  day: string,
  hour: number,
  place: { latitude: number; longitude: number } | null,
  overrides: Partial<LibraryAsset> = {},
): LibraryAsset {
  counter += 1;
  const jitter = (counter % 7) * 0.002;
  return {
    platform: "ios",
    nativeId: `A-${counter}`,
    takenAt: `${day}T${String(hour).padStart(2, "0")}:${String(counter % 60).padStart(2, "0")}:00.000Z`,
    latitude: place ? place.latitude + jitter : null,
    longitude: place ? place.longitude + jitter : null,
    width: 4032,
    height: 3024,
    ...overrides,
  };
}

/** `perDay` photos on each day from `from` to `to` (inclusive), all at `place`. */
export function photosBetween(
  from: string,
  to: string,
  place: { latitude: number; longitude: number } | null,
  perDay = 4,
): LibraryAsset[] {
  const result: LibraryAsset[] = [];
  for (
    let time = Date.parse(`${from}T00:00:00Z`);
    time <= Date.parse(`${to}T00:00:00Z`);
    time += 86_400_000
  ) {
    const day = new Date(time).toISOString().slice(0, 10);
    for (let index = 0; index < perDay; index += 1) {
      result.push(asset(day, 6 + (index % 17), place));
    }
  }
  return result;
}

/** A person's everyday life at home: enough distinct days for "home" to be detected. */
export function homeLife(from = "2026-01-01", to = "2026-02-20"): LibraryAsset[] {
  return photosBetween(from, to, HOME, 2);
}

export function existingTrip(overrides: Partial<ExistingTrip> = {}): ExistingTrip {
  return {
    albumId: "album-1",
    experienceId: "exp-1",
    experienceSlug: "paris",
    title: "França, Paris",
    countryCode: "FR",
    startsAt: "2026-06-10T10:00:00.000Z",
    endsAt: "2026-06-15T18:00:00.000Z",
    photoCount: 30,
    center: PARIS,
    radiusKm: 5,
    ...overrides,
  };
}

export const NEW_YORK = { latitude: 40.7128, longitude: -74.006 };
export const BOSTON = { latitude: 42.3601, longitude: -71.0589 };
export const VERSAILLES = { latitude: 48.8049, longitude: 2.1204 };

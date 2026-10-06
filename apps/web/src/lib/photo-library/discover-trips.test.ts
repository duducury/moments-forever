import assert from "node:assert/strict";
import test from "node:test";

import { detectHome, discoverTrips } from "./discover-trips";
import {
  CANCUN,
  HOME,
  PARIS,
  ROME,
  asset,
  homeLife,
  photosBetween,
} from "./test-helpers";

test("an empty library finds no trips", () => {
  assert.deepEqual(discoverTrips([]), []);
});

test("a library of only home photos finds no trips", () => {
  assert.deepEqual(discoverTrips(homeLife()), []);
});

test("one trip away from home is found with its dates and place", () => {
  const trips = discoverTrips([...homeLife(), ...photosBetween("2026-06-10", "2026-06-12", PARIS)]);
  assert.equal(trips.length, 1);
  const [trip] = trips;
  assert.equal(trip?.startDate, "2026-06-10");
  assert.equal(trip?.endDate, "2026-06-12");
  assert.equal(trip?.assets.length, 12);
  assert.ok(Math.abs((trip?.center?.latitude ?? 0) - PARIS.latitude) < 0.05);
});

test("several trips are found, newest first, and never mixed", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-05-20", "2026-05-25", ROME),
    ...photosBetween("2026-06-10", "2026-06-15", PARIS),
    ...photosBetween("2026-04-03", "2026-04-08", CANCUN),
  ]);
  assert.deepEqual(
    trips.map((trip) => trip.startDate),
    ["2026-06-10", "2026-05-20", "2026-04-03"],
  );
});

test("Paris 10–12 and Paris 13–15 become one trip", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-06-10", "2026-06-12", PARIS),
    ...photosBetween("2026-06-13", "2026-06-15", PARIS),
  ]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0]?.startDate, "2026-06-10");
  assert.equal(trips[0]?.endDate, "2026-06-15");
});

test("two places back to back stay two trips", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-06-10", "2026-06-12", PARIS),
    ...photosBetween("2026-06-13", "2026-06-15", ROME),
  ]);
  assert.equal(trips.length, 2);
});

test("the same country in different years is two trips (Brasil 2024 ≠ Brasil 2026)", () => {
  const rio = { latitude: -22.9, longitude: -43.2 };
  const trips = discoverTrips([
    ...homeLife("2024-01-01", "2024-02-20"),
    ...photosBetween("2024-07-01", "2024-07-05", rio),
    ...photosBetween("2026-07-01", "2026-07-05", rio),
  ]);
  assert.equal(trips.length, 2);
});

test("photos without GPS join the trip by date", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-06-10", "2026-06-12", PARIS),
    asset("2026-06-11", 20, null),
    asset("2026-06-11", 21, null),
    asset("2026-03-01", 12, null), // outside any trip: ignored
  ]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0]?.withoutLocationCount, 2);
  assert.equal(trips[0]?.assets.length, 14);
});

test("photos without a date are never placed in a trip", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-06-10", "2026-06-12", PARIS),
    asset("2026-06-11", 9, PARIS, { takenAt: null }),
  ]);
  assert.equal(trips[0]?.assets.length, 12);
});

test("a handful of photos is not a trip", () => {
  const trips = discoverTrips([...homeLife(), asset("2026-06-10", 10, PARIS), asset("2026-06-10", 11, PARIS)]);
  assert.deepEqual(trips, []);
});

test("without any GPS nothing is guessed", () => {
  assert.deepEqual(discoverTrips(photosBetween("2026-06-10", "2026-06-15", null)), []);
});

test("home is the place with the most days of photos", () => {
  const home = detectHome([...homeLife(), ...photosBetween("2026-06-10", "2026-06-12", PARIS)]);
  assert.ok(home);
  assert.ok(Math.abs(home.latitude - HOME.latitude) < 0.1);
});

test("with too little history there is no home, and trips are still grouped", () => {
  assert.equal(detectHome(photosBetween("2026-06-10", "2026-06-12", PARIS)), null);
  const trips = discoverTrips(photosBetween("2026-06-10", "2026-06-12", PARIS));
  assert.equal(trips.length, 1);
});

import { BOSTON, NEW_YORK, VERSAILLES } from "./test-helpers";

test("five consecutive days in New York are one trip", () => {
  const trips = discoverTrips([...homeLife(), ...photosBetween("2026-08-22", "2026-08-26", NEW_YORK, 5)]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0]?.startDate, "2026-08-22");
  assert.equal(trips[0]?.endDate, "2026-08-26");
  assert.equal(trips[0]?.stops.length, 1);
});

test("quiet days with no photos at all do not split a stay (nothing says the person went home)", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-08-22", "2026-08-23", NEW_YORK, 4),
    ...photosBetween("2026-08-27", "2026-08-28", NEW_YORK, 4),
  ]);
  assert.equal(trips.length, 1);
});

test("but a photo at home in between means the person came back: two trips", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-08-22", "2026-08-23", NEW_YORK, 4),
    ...photosBetween("2026-08-25", "2026-08-25", HOME, 3),
    ...photosBetween("2026-08-27", "2026-08-28", NEW_YORK, 4),
  ]);
  assert.equal(trips.length, 2);
});

test("New York → Boston → New York is a single trip with both places, in visiting order", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-08-22", "2026-08-23", NEW_YORK, 5),
    ...photosBetween("2026-08-24", "2026-08-25", BOSTON, 5),
    ...photosBetween("2026-08-26", "2026-08-26", NEW_YORK, 5),
  ]);
  assert.equal(trips.length, 1);
  const [trip] = trips;
  assert.equal(trip?.endDate, "2026-08-26");
  assert.equal(trip?.stops.length, 2);
  assert.ok((trip?.stops[0]?.center.latitude ?? 0) < 41.5, "New York first");
  assert.ok((trip?.stops[1]?.center.latitude ?? 0) > 41.5, "then Boston");
});

test("Paris and Versailles are one trip, with two named stops", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-06-10", "2026-06-13", PARIS, 6),
    ...photosBetween("2026-06-14", "2026-06-14", VERSAILLES, 6),
  ]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0]?.stops.length, 2);
});

test("a place with only a couple of photos is not listed as a stop", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-06-10", "2026-06-13", PARIS, 8),
    asset("2026-06-14", 10, VERSAILLES),
    asset("2026-06-14", 11, VERSAILLES),
  ]);
  assert.equal(trips[0]?.stops.length, 1);
});

test("a trip is never given stops without GPS: no invented place", () => {
  const trips = discoverTrips(photosBetween("2026-06-10", "2026-06-15", null, 4));
  assert.deepEqual(trips, []);
});

test("3 or more GPS photos: a normal trip with a location", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2026-06-10", "2026-06-11", PARIS, 2),
    ...photosBetween("2026-06-10", "2026-06-11", null, 6),
  ]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0]?.locationQuality, "located");
  assert.equal(trips[0]?.stops.length, 1);
  assert.ok(trips[0]?.center);
});

test("1–2 GPS photos plus many without: a possible trip, but its location is NOT trusted", () => {
  const trips = discoverTrips([
    ...homeLife(),
    asset("2025-11-04", 10, PARIS),
    asset("2025-11-05", 11, PARIS),
    ...photosBetween("2025-11-04", "2025-11-05", null, 8),
  ]);
  const limited = trips.find((trip) => trip.startDate === "2025-11-04");
  assert.ok(limited);
  assert.equal(limited?.locationQuality, "limited");
  assert.deepEqual(limited?.stops, [], "no place to name");
  assert.equal(limited?.center, null, "and not matched by place either");
  assert.ok((limited?.assets.length ?? 0) >= 16);
});

test("a single GPS photo does not turn dozens of photos without GPS into a located trip", () => {
  const trips = discoverTrips([
    ...homeLife(),
    asset("2025-11-04", 10, PARIS),
    ...photosBetween("2025-11-04", "2025-11-04", null, 40),
  ]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0]?.locationQuality, "limited");
  assert.equal(trips[0]?.stops.length, 0);
});

test("1–2 GPS photos, but a photo at home on the same days: not a trip at all", () => {
  const trips = discoverTrips([
    ...homeLife(),
    asset("2025-11-04", 10, PARIS),
    ...photosBetween("2025-11-04", "2025-11-04", HOME, 3),
    ...photosBetween("2025-11-04", "2025-11-04", null, 12),
  ]);
  assert.deepEqual(trips, []);
});

test("1–2 GPS photos with too few photos overall is noise", () => {
  const trips = discoverTrips([
    ...homeLife(),
    asset("2025-11-04", 10, PARIS),
    ...photosBetween("2025-11-04", "2025-11-04", null, 3),
  ]);
  assert.deepEqual(trips, []);
});

test("0 GPS: a clear multi-day burst is a possible trip with no location at all", () => {
  const trips = discoverTrips([
    ...homeLife(),
    ...photosBetween("2025-11-04", "2025-11-07", null, 9),
  ]);
  const none = trips.find((trip) => trip.startDate === "2025-11-04");
  assert.ok(none);
  assert.equal(none?.locationQuality, "none");
  assert.equal(none?.center, null);
  assert.deepEqual(none?.stops, []);
  assert.equal(none?.assets.length, 36);
});

test("0 GPS: a single day, a handful of photos, or a normal pace is not a trip", () => {
  assert.deepEqual(discoverTrips([...homeLife(), ...photosBetween("2025-11-04", "2025-11-04", null, 30)]), [], "one day");
  assert.deepEqual(discoverTrips([...homeLife(), ...photosBetween("2025-11-04", "2025-11-06", null, 2)]), [], "few photos");
  // A library where every day has ~9 photos: 9/day is simply how this person shoots.
  const busyEveryDay = photosBetween("2026-01-01", "2026-03-01", null, 9);
  assert.deepEqual(discoverTrips(busyEveryDay), []);
});

test("0 GPS: photos on days with a home photo or any GPS photo are never a trip", () => {
  assert.deepEqual(
    discoverTrips([
      ...homeLife(),
      ...photosBetween("2025-11-04", "2025-11-07", null, 9),
      asset("2025-11-05", 12, HOME),
    ]),
    [],
  );
});

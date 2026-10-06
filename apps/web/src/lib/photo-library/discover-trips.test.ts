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

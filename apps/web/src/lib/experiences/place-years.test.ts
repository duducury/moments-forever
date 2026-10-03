import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPlacesByYear,
  placeYear,
  placeYearOptions,
} from "./place-years";

const trip = (id: string, startsAt: string | null, endsAt: string | null = null) => ({
  id,
  startsAt,
  endsAt,
});

const places = [
  trip("a", "2026-03-01T10:00:00Z", "2026-03-09T10:00:00Z"),
  trip("b", "2025-12-30T23:30:00-03:00", "2026-01-03T10:00:00Z"),
  trip("c", "2025-07-10T00:00:00Z"),
  trip("d", null, "2024-05-05T00:00:00Z"),
  trip("e", "2024-01-01T00:00:00Z"),
  trip("f", null, null),
];

test("a trip belongs to the year it started, else the year it ended", () => {
  assert.equal(placeYear(places[0]!), 2026);
  assert.equal(placeYear(places[1]!), 2025, "started in 2025 even though it ended in 2026");
  assert.equal(placeYear(places[3]!), 2024, "only an end date is known");
  assert.equal(placeYear(places[5]!), null);
});

test("the year comes from the date text, not the viewer's time zone", () => {
  assert.equal(placeYear(trip("x", "2025-01-01T00:00:00Z")), 2025);
  assert.equal(placeYear(trip("y", "2025-12-31T23:59:59-12:00")), 2025);
});

test("garbage dates are treated as undated", () => {
  assert.equal(placeYear(trip("x", "not-a-date")), null);
  assert.equal(placeYear(trip("y", "")), null);
  assert.equal(placeYear(trip("z", "0001-01-01")), null);
});

test("year options: most recent first, no duplicates, undated flagged", () => {
  assert.deepEqual(placeYearOptions(places), { years: [2026, 2025, 2024], hasUndated: true });
  assert.deepEqual(placeYearOptions([trip("a", "2024-02-02")]), { years: [2024], hasUndated: false });
  assert.deepEqual(placeYearOptions([]), { years: [], hasUndated: false });
});

test("filtering: Todos keeps everything and the order; a year keeps only its trips", () => {
  assert.equal(filterPlacesByYear(places, "all"), places);
  assert.deepEqual(filterPlacesByYear(places, 2025).map((p) => p.id), ["b", "c"]);
  assert.deepEqual(filterPlacesByYear(places, 2024).map((p) => p.id), ["d", "e"]);
  assert.deepEqual(filterPlacesByYear(places, 2023).map((p) => p.id), []);
  assert.deepEqual(filterPlacesByYear(places, "none").map((p) => p.id), ["f"]);
});

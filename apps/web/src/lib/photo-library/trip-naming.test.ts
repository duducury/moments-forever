import assert from "node:assert/strict";
import test from "node:test";

import { nearestKnownCity, parseKnownCities } from "./place-fallback";
import {
  describeTrip,
  LIMITED_LOCATION_NOTE,
  NO_LOCATION_NOTE,
  parsePlaceLabel,
  POSSIBLE_TRIP_TITLE,
  UNNAMED_PLACE_TITLE,
} from "./trip-naming";
import type { TripStop } from "./types";

function stop(id: string, latitude = 40, longitude = -74): TripStop {
  return { id, center: { latitude, longitude }, photoCount: 10, firstDay: "2026-08-22" };
}

const none = new Set<string>();

test("a trip with a resolved place is named by it, never by its dates", () => {
  const result = describeTrip({
    locationQuality: "located",
    stops: [stop("a")],
    labels: { a: "Estados Unidos, New York" },
    settled: new Set(["a"]),
  });
  assert.equal(result.title, "New York");
  assert.equal(result.name, "Estados Unidos, New York");
  assert.equal(result.countryCode, "US");
  assert.equal(result.state, "named");
});

test("several places read as New York → Boston (and Paris → Versailles)", () => {
  const ny = describeTrip({
    locationQuality: "located",
    stops: [stop("a"), stop("b")],
    labels: { a: "Estados Unidos, New York", b: "Estados Unidos, Boston" },
    settled: new Set(["a", "b"]),
  });
  assert.equal(ny.title, "New York → Boston");
  assert.equal(ny.name, "Estados Unidos, New York → Boston");

  const paris = describeTrip({
    locationQuality: "located",
    stops: [stop("a"), stop("b")],
    labels: { a: "França, Paris", b: "França, Versailles" },
    settled: new Set(["a", "b"]),
  });
  assert.equal(paris.title, "Paris → Versailles");
});

test("two stops with the same place name are listed once", () => {
  const result = describeTrip({
    locationQuality: "located",
    stops: [stop("a"), stop("b")],
    labels: { a: "França, Paris", b: "França, Paris" },
    settled: new Set(["a", "b"]),
  });
  assert.equal(result.title, "Paris");
});

test("while a lookup is still running nothing is shown, so nothing can flicker or be invented", () => {
  const result = describeTrip({
    locationQuality: "located",
    stops: [stop("a"), stop("b")],
    labels: { a: "França, Paris" },
    settled: none,
  });
  assert.equal(result.state, "pending");
  assert.equal(result.title, "");
});

test("a place the geocoder could not name is said plainly, not invented", () => {
  const result = describeTrip({ stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set(["a"]) });
  assert.equal(result.state, "unnamed");
  assert.equal(result.title, UNNAMED_PLACE_TITLE);
});

test("with one stop named and another not, the named one is shown", () => {
  const result = describeTrip({
    locationQuality: "located",
    stops: [stop("a"), stop("b")],
    labels: { a: "Itália, Roma" },
    settled: new Set(["a", "b"]),
  });
  assert.equal(result.title, "Roma");
});

test("1–2 GPS photos: a possible trip with limited location — no place, no flag, no made-up name", () => {
  const result = describeTrip({
    stops: [],
    locationQuality: "limited",
    labels: {},
    settled: none,
  });
  assert.deepEqual(
    [result.state, result.title, result.name, result.countryCode, result.locationNote],
    ["possible", POSSIBLE_TRIP_TITLE, "", null, LIMITED_LOCATION_NOTE],
  );
});

test("0 GPS photos: a possible trip, and it says there is no location in the photos", () => {
  const result = describeTrip({ stops: [], locationQuality: "none", labels: {}, settled: none });
  assert.deepEqual(
    [result.state, result.title, result.locationNote],
    ["possible", POSSIBLE_TRIP_TITLE, NO_LOCATION_NOTE],
  );
});

test("even if labels exist for its stops, a trip that is not 'located' is never given a place", () => {
  const result = describeTrip({
    stops: [stop("a")],
    locationQuality: "limited",
    labels: { a: "França, Paris" },
    settled: new Set(["a"]),
  });
  assert.equal(result.state, "possible");
  assert.equal(result.title, POSSIBLE_TRIP_TITLE);
  assert.equal(result.countryCode, null);
});

test("labels of any shape are parsed: with country, without, or country only", () => {
  assert.deepEqual(parsePlaceLabel("França, Paris"), { country: "França", locality: "Paris" });
  assert.deepEqual(parsePlaceLabel("Springfield"), { country: null, locality: "Springfield" });
  assert.deepEqual(parsePlaceLabel("Tanzânia"), { country: "Tanzânia", locality: null });
  assert.deepEqual(parsePlaceLabel("  "), { country: null, locality: null });
  const countryOnly = describeTrip({
    locationQuality: "located",
    stops: [stop("a")],
    labels: { a: "Tanzânia" },
    settled: new Set(["a"]),
  });
  assert.equal(countryOnly.title, "Tanzânia");
  assert.equal(countryOnly.name, "Tanzânia");
  assert.equal(countryOnly.countryCode, "TZ");
});

test("offline fallback names a spot only when a listed city is really close", () => {
  const cities = parseKnownCities({
    features: [
      { properties: { k: "city", n: "Nova York" }, geometry: { coordinates: [-74.006, 40.714] } },
      { properties: { k: "country", n: "Estados Unidos" }, geometry: { coordinates: [-98.5, 39.5] } },
      { properties: { k: "city", n: "Boston" }, geometry: { coordinates: [-71.06, 42.36] } },
    ],
  });
  assert.equal(cities.length, 2, "countries and regions are not cities");
  assert.equal(nearestKnownCity({ latitude: 40.75, longitude: -73.99 }, cities)?.name, "Nova York");
  assert.equal(nearestKnownCity({ latitude: 41.5, longitude: -72.5 }, cities), null, "far from both: no guess");
});

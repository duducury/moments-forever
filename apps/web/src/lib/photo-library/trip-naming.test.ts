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

const ny = { label: "NY, USA", countryCode: "US", city: "Nova Iorque" };
const nyNoCity = { label: "NY, USA", countryCode: "US", city: null };

test("while loading: the local city is the title right away; without one, a placeholder + the state pill", () => {
  const withCity = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set(), quick: { a: ny },
  });
  assert.equal(withCity.state, "pending");
  assert.equal(withCity.title, "Nova Iorque");
  assert.equal(withCity.placeLabel, "NY, USA");
  // No flag / country yet: matching against existing trips is unchanged while loading.
  assert.equal(withCity.countryCode, null);

  const stateOnly = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set(), quick: { a: nyNoCity },
  });
  assert.equal(stateOnly.title, ""); // card shows a placeholder, the pill already says "NY, USA"
  assert.equal(stateOnly.placeLabel, "NY, USA");
  assert.equal(stateOnly.quickCountryCode, "US");
});

test("stability: the geocoder never replaces a local city that is already on screen", () => {
  for (const geocoded of ["Estados Unidos, Manhattan", "Estados Unidos, Nova Iorque", "Estados Unidos"]) {
    const result = describeTrip({
      stops: [stop("a")], locationQuality: "located", labels: { a: geocoded }, settled: new Set(["a"]), quick: { a: ny },
    });
    assert.equal(result.state, "named", geocoded);
    assert.equal(result.title, "Nova Iorque", geocoded);
  }
});

test("improving: state-only becomes the geocoder's city once it arrives", () => {
  const result = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: { a: "Estados Unidos, Farmington" },
    settled: new Set(["a"]), quick: { a: nyNoCity },
  });
  assert.equal(result.title, "Farmington");
  assert.equal(result.name, "Estados Unidos, Farmington");
  assert.equal(result.countryCode, "US");
});

test("never a step down: a bare country or 'not identified' never replaces the local state", () => {
  const countryOnly = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: { a: "Estados Unidos" },
    settled: new Set(["a"]), quick: { a: nyNoCity },
  });
  assert.equal(countryOnly.title, "NY, USA");

  const nothing = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set(["a"]), quick: { a: nyNoCity },
  });
  assert.equal(nothing.state, "named");
  assert.equal(nothing.title, "NY, USA");
  assert.equal(nothing.name, "NY, USA");
  assert.equal(nothing.countryCode, "US");
});

test("no offline label: still the placeholder, and 'not identified' when nothing is found", () => {
  const pending = describeTrip({ stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set() });
  assert.equal(pending.state, "pending");
  assert.equal(pending.title, "");
  const none = describeTrip({ stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set(["a"]) });
  assert.equal(none.state, "unnamed");
});

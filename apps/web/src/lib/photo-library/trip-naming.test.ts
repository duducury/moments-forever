import assert from "node:assert/strict";
import test from "node:test";

import { usStateCodeFromPlaceLabel, usStateNameFromCode } from "@moments-forever/shared";

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
  assert.equal(result.title, "Estados Unidos — New York");
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
  assert.equal(ny.title, "Estados Unidos — New York → Boston");
  assert.equal(ny.name, "Estados Unidos, New York → Boston");

  const paris = describeTrip({
    locationQuality: "located",
    stops: [stop("a"), stop("b")],
    labels: { a: "França, Paris", b: "França, Versailles" },
    settled: new Set(["a", "b"]),
  });
  assert.equal(paris.title, "França — Paris → Versailles");
});

test("two stops with the same place name are listed once", () => {
  const result = describeTrip({
    locationQuality: "located",
    stops: [stop("a"), stop("b")],
    labels: { a: "França, Paris", b: "França, Paris" },
    settled: new Set(["a", "b"]),
  });
  assert.equal(result.title, "França — Paris");
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
  assert.equal(result.title, "Itália — Roma");
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
  assert.equal(withCity.title, "Estados Unidos — New York");
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
    assert.equal(result.title, "Estados Unidos — New York", geocoded);
  }
});

test("improving: state-only becomes the geocoder's city once it arrives", () => {
  const result = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: { a: "Estados Unidos, Farmington" },
    settled: new Set(["a"]), quick: { a: nyNoCity },
  });
  assert.equal(result.title, "Estados Unidos — Farmington, New York");
  assert.equal(result.name, "Estados Unidos, Farmington, New York");
  assert.equal(result.countryCode, "US");
});

test("never a step down: a bare country or 'not identified' never replaces the local state", () => {
  const countryOnly = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: { a: "Estados Unidos" },
    settled: new Set(["a"]), quick: { a: nyNoCity },
  });
  assert.equal(countryOnly.title, "Estados Unidos — New York");

  const nothing = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set(["a"]), quick: { a: nyNoCity },
  });
  assert.equal(nothing.state, "named");
  assert.equal(nothing.title, "Estados Unidos — New York");
  assert.equal(nothing.name, "Estados Unidos, New York");
  assert.equal(nothing.countryCode, "US");
});

test("no offline label: still the placeholder, and 'not identified' when nothing is found", () => {
  const pending = describeTrip({ stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set() });
  assert.equal(pending.state, "pending");
  assert.equal(pending.title, "");
  const none = describeTrip({ stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set(["a"]) });
  assert.equal(none.state, "unnamed");
});

// ---- names: country first, then the city/state; every trip keeps its own place ------------------------

test("two independent US trips never share a name (state from the offline place when the geocoder gives nothing)", () => {
  const pa = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set(["a"]),
    quick: { a: { label: "PA, USA", countryCode: "US", city: null } },
  });
  const upstate = describeTrip({
    stops: [stop("b")], locationQuality: "located", labels: { b: "Estados Unidos" }, settled: new Set(["b"]),
    quick: { b: { label: "NY, USA", countryCode: "US", city: null } },
  });
  assert.equal(pa.name, "Estados Unidos, Pennsylvania");
  assert.equal(upstate.name, "Estados Unidos, New York");
  assert.notEqual(pa.name, upstate.name);
  assert.equal(pa.countryCode, "US");
});

test("Philadelphia reads 'Estados Unidos — Filadélfia, Pennsylvania'; the stored name keeps the app's 'País, Local' form", () => {
  const result = describeTrip({
    stops: [stop("a", 39.95, -75.16)], locationQuality: "located", labels: { a: "Estados Unidos, Filadélfia" },
    settled: new Set(["a"]), quick: { a: { label: "PA, USA", countryCode: "US", city: null } },
  });
  assert.equal(result.title, "Estados Unidos — Filadélfia, Pennsylvania");
  assert.equal(result.name, "Estados Unidos, Filadélfia, Pennsylvania");
  assert.equal(usStateCodeFromPlaceLabel(result.name), "PA", "the app still recognises the state");
  assert.equal(result.countryCode, "US");
});

test("country first, then the city: 'Brasil — Brasília'; the small town next to it is kept, listed after it", () => {
  const brasilia = { label: "Brasil", countryCode: "BR", city: "Brasília" };
  const brazlandia = { label: "Brasil", countryCode: "BR", city: null };
  const result = describeTrip({
    stops: [stop("b", -15.67, -48.2), stop("a", -15.78, -47.93)], locationQuality: "located",
    labels: { a: "Brasil, Brasília", b: "Brasil, Brazlândia" }, settled: new Set(["a", "b"]),
    quick: { a: brasilia, b: brazlandia },
  });
  assert.equal(result.title, "Brasil — Brasília → Brazlândia", "main city first, nothing dropped");
  assert.equal(result.name, "Brasil, Brasília → Brazlândia");
  assert.equal(result.countryCode, "BR");
});

test("no stop is ever removed: Paris → Versailles and Washington → Baltimore stay", () => {
  const paris = describeTrip({
    stops: [stop("a", 48.85, 2.35), stop("b", 48.8, 2.12)], locationQuality: "located",
    labels: { a: "França, Paris", b: "França, Versailles" }, settled: new Set(["a", "b"]),
    quick: { a: { label: "França", countryCode: "FR", city: "Paris" }, b: { label: "França", countryCode: "FR", city: null } },
  });
  assert.equal(paris.title, "França — Paris → Versailles");
  const dc = describeTrip({
    stops: [stop("a", 38.9, -77.03), stop("b", 39.29, -76.61)], locationQuality: "located",
    labels: { a: "Estados Unidos, Washington", b: "Estados Unidos, Baltimore" }, settled: new Set(["a", "b"]),
    quick: { a: { label: "DC, USA", countryCode: "US", city: "Washington, D.C." }, b: { label: "MD, USA", countryCode: "US", city: null } },
  });
  assert.equal(dc.title, "Estados Unidos — Washington, DC → Baltimore, Maryland");
  // A satellite visited first still reads after the main city; a distant stop keeps its order.
  const versaillesFirst = describeTrip({
    stops: [stop("b", 48.8, 2.12), stop("a", 48.85, 2.35), stop("c", 45.76, 4.84)], locationQuality: "located",
    labels: { a: "França, Paris", b: "França, Versailles", c: "França, Lyon" }, settled: new Set(["a", "b", "c"]),
    quick: { a: { label: "França", countryCode: "FR", city: "Paris" }, b: { label: "França", countryCode: "FR", city: null }, c: { label: "França", countryCode: "FR", city: null } },
  });
  assert.equal(versaillesFirst.title, "França — Paris → Versailles → Lyon");
});

test("offline information is never thrown away: no geocoder answer still names the country / state", () => {
  const brazil = describeTrip({
    stops: [stop("a", -15.67, -48.2)], locationQuality: "located", labels: {}, settled: new Set(["a"]),
    quick: { a: { label: "Brasil", countryCode: "BR", city: null } },
  });
  assert.equal(brazil.state, "named");
  assert.equal(brazil.title, "Brasil");
  assert.equal(brazil.countryCode, "BR");
  const italy = describeTrip({
    stops: [stop("a", 43.7, 11.2)], locationQuality: "located", labels: {}, settled: new Set(["a"]),
    quick: { a: { label: "Itália", countryCode: "IT", city: null } },
  });
  assert.equal(italy.title, "Itália");
  assert.equal(italy.countryCode, "IT");
  const usa = describeTrip({
    stops: [stop("a", 30, -100)], locationQuality: "located", labels: {}, settled: new Set(["a"]),
    quick: { a: { label: "USA", countryCode: "US", city: null } },
  });
  assert.equal(usa.title, "Estados Unidos");
  assert.equal(usa.countryCode, "US");
  const city = describeTrip({
    stops: [stop("a", -22.9, -43.2)], locationQuality: "located", labels: {}, settled: new Set(["a"]),
    quick: { a: { label: "Brasil", countryCode: "BR", city: "Rio de Janeiro" } },
  });
  assert.equal(city.title, "Brasil — Rio de Janeiro");
  // Only with NO information at all is a place "not identified".
  assert.equal(describeTrip({ stops: [stop("a")], locationQuality: "located", labels: {}, settled: new Set(["a"]) }).state, "unnamed");
});

test("no repeated state: 'Nova York' in New York and Washington D.C. read once, and the state is still recognised", () => {
  const nyc = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: { a: "Estados Unidos, Nova York" }, settled: new Set(["a"]),
    quick: { a: { label: "NY, USA", countryCode: "US", city: "Nova York" } },
  });
  assert.equal(nyc.title, "Estados Unidos — New York");
  assert.equal(nyc.name, "Estados Unidos, New York");
  assert.equal(usStateCodeFromPlaceLabel(nyc.name), "NY");
  const dc = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: { a: "Estados Unidos, Washington" }, settled: new Set(["a"]),
    quick: { a: { label: "DC, USA", countryCode: "US", city: "Washington, D.C." } },
  });
  assert.equal(dc.title, "Estados Unidos — Washington, DC");
  assert.equal(usStateCodeFromPlaceLabel(dc.name), "DC");
  // A real city keeps its state.
  const buffalo = describeTrip({
    stops: [stop("a")], locationQuality: "located", labels: { a: "Estados Unidos, Buffalo" }, settled: new Set(["a"]),
    quick: { a: { label: "NY, USA", countryCode: "US", city: null } },
  });
  assert.equal(buffalo.title, "Estados Unidos — Buffalo, New York");
  assert.equal(usStateCodeFromPlaceLabel(buffalo.name), "NY");
});

test("distant stops are different destinations and both stay (Vila Velha → Rio de Janeiro)", () => {
  const result = describeTrip({
    stops: [stop("a", -20.33, -40.29), stop("b", -22.9, -43.2)], locationQuality: "located",
    labels: { a: "Brasil, Vila Velha", b: "Brasil, Rio de Janeiro" }, settled: new Set(["a", "b"]),
    quick: { a: { label: "Brasil", countryCode: "BR", city: null }, b: { label: "Brasil", countryCode: "BR", city: "Rio de Janeiro" } },
  });
  assert.equal(result.title, "Brasil — Vila Velha → Rio de Janeiro");
});

test("usStateNameFromCode gives the English state name", () => {
  assert.equal(usStateNameFromCode("PA"), "Pennsylvania");
  assert.equal(usStateNameFromCode("ny"), "New York");
  assert.equal(usStateNameFromCode("HI"), "Hawaii");
  assert.equal(usStateNameFromCode("DC"), "District of Columbia");
  assert.equal(usStateNameFromCode("XX"), null);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseKnownCities } from "./place-fallback";
import { quickPlace, type AdminGeo } from "./quick-place";

const geo = JSON.parse(
  readFileSync(new URL("../../../public/geo/admin-v1.json", import.meta.url), "utf8"),
) as AdminGeo;

const cities = parseKnownCities(
  JSON.parse(readFileSync(new URL("../../../public/geo/places-v1.json", import.meta.url), "utf8")),
);
const at = (latitude: number, longitude: number) => quickPlace({ latitude, longitude }, geo);
const withCity = (latitude: number, longitude: number) => quickPlace({ latitude, longitude }, geo, cities);

test("US trips are named by state abbreviation + USA", () => {
  assert.deepEqual(at(41.7658, -72.6734), { label: "CT, USA", countryCode: "US", city: null }); // Hartford
  assert.deepEqual(at(42.3601, -71.0589), { label: "MA, USA", countryCode: "US", city: null }); // Boston
  assert.deepEqual(at(40.7128, -74.006), { label: "NY, USA", countryCode: "US", city: null }); // New York
  assert.deepEqual(at(25.7617, -80.1918), { label: "FL, USA", countryCode: "US", city: null }); // Miami
  assert.deepEqual(at(21.3069, -157.8583), { label: "HI, USA", countryCode: "US", city: null }); // Honolulu
});

test("a coastal spot just outside the simplified outline still gets its state", () => {
  assert.equal(at(42.0584, -70.1786)?.label, "MA, USA"); // Provincetown, tip of Cape Cod
});

test("outside the US the country is named (no guessed region)", () => {
  assert.deepEqual(at(41.9028, 12.4964), { label: "Itália", countryCode: "IT", city: null }); // Rome
  assert.deepEqual(at(38.7223, -9.1393), { label: "Portugal", countryCode: "PT", city: null }); // Lisbon
  assert.deepEqual(at(-23.5505, -46.6333), { label: "Brasil", countryCode: "BR", city: null }); // São Paulo
});

test("open sea has no quick place", () => {
  assert.equal(at(30, -40), null);
});

test("never throws on odd coordinates", () => {
  assert.equal(at(0, 0), null);
  assert.equal(at(89.9, 179.9) === null || typeof at(89.9, 179.9)?.label === "string", true);
});

test("with the city list: the city is named only where it really is, in the same state/country", () => {
  const manhattan = withCity(40.758, -73.9855);
  assert.equal(manhattan?.label, "NY, USA");
  assert.equal(manhattan?.city, cities.find((c) => /Nova Iorque/.test(c.name))?.name ?? manhattan?.city);
  assert.ok(manhattan?.city, "Manhattan is next to a listed city");
  // Hoboken (NJ) is a few km from New York, but across the state line: never "Nova Iorque".
  const hoboken = withCity(40.744, -74.0324);
  assert.equal(hoboken?.label, "NJ, USA");
  assert.notEqual(hoboken?.city, manhattan?.city);
  // Open country, no listed city nearby: only the state.
  assert.equal(withCity(41.7658, -72.6734)?.label, "CT, USA");
});

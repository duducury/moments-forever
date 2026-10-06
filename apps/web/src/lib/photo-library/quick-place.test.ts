import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { quickPlace, type AdminGeo } from "./quick-place";

const geo = JSON.parse(
  readFileSync(new URL("../../../public/geo/admin-v1.json", import.meta.url), "utf8"),
) as AdminGeo;

const at = (latitude: number, longitude: number) => quickPlace({ latitude, longitude }, geo);

test("US trips are named by state abbreviation + USA", () => {
  assert.deepEqual(at(41.7658, -72.6734), { label: "CT, USA", countryCode: "US" }); // Hartford
  assert.deepEqual(at(42.3601, -71.0589), { label: "MA, USA", countryCode: "US" }); // Boston
  assert.deepEqual(at(40.7128, -74.006), { label: "NY, USA", countryCode: "US" }); // New York
  assert.deepEqual(at(25.7617, -80.1918), { label: "FL, USA", countryCode: "US" }); // Miami
  assert.deepEqual(at(21.3069, -157.8583), { label: "HI, USA", countryCode: "US" }); // Honolulu
});

test("a coastal spot just outside the simplified outline still gets its state", () => {
  assert.equal(at(42.0584, -70.1786)?.label, "MA, USA"); // Provincetown, tip of Cape Cod
});

test("outside the US the country is named (no guessed region)", () => {
  assert.deepEqual(at(41.9028, 12.4964), { label: "Itália", countryCode: "IT" }); // Rome
  assert.deepEqual(at(38.7223, -9.1393), { label: "Portugal", countryCode: "PT" }); // Lisbon
  assert.deepEqual(at(-23.5505, -46.6333), { label: "Brasil", countryCode: "BR" }); // São Paulo
});

test("open sea has no quick place", () => {
  assert.equal(at(30, -40), null);
});

test("never throws on odd coordinates", () => {
  assert.equal(at(0, 0), null);
  assert.equal(at(89.9, 179.9) === null || typeof at(89.9, 179.9)?.label === "string", true);
});

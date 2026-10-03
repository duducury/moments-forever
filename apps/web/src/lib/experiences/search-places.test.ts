import assert from "node:assert/strict";
import test from "node:test";

import { filterPlacesByQuery, normalizeSearchText } from "./search-places";

const p = (
  title: string,
  startsAt: string | null,
  experienceTitle = "Viagem",
  countryCode: string | null = null,
) => ({ title, experienceTitle, countryCode, startsAt, endsAt: null });

const places = [
  p("São Paulo", "2026-03-01T10:00:00Z"),
  p("Roma", "2024-05-01T10:00:00Z", "Itália 2024", "IT"),
  p("Florença", "2024-05-04T10:00:00Z", "Itália 2024", "IT"),
  p("Dubai", null, "Emirados"),
];

const titles = (list: readonly { title: string }[]) => list.map((x) => x.title);

test("normalizes accents, case and spaces", () => {
  assert.equal(normalizeSearchText("  São   PAULO "), "sao paulo");
  assert.equal(normalizeSearchText("Florença"), "florenca");
});

test("empty or blank query leaves the list untouched", () => {
  assert.equal(filterPlacesByQuery(places, ""), places);
  assert.equal(filterPlacesByQuery(places, "   "), places);
});

test("matches without accents and on partial words", () => {
  assert.deepEqual(titles(filterPlacesByQuery(places, "sao pa")), ["São Paulo"]);
  assert.deepEqual(titles(filterPlacesByQuery(places, "florenc")), ["Florença"]);
});

test("also searches the parent trip title, country code and year", () => {
  assert.deepEqual(titles(filterPlacesByQuery(places, "italia")), ["Roma", "Florença"]);
  assert.deepEqual(titles(filterPlacesByQuery(places, "2026")), ["São Paulo"]);
  assert.deepEqual(titles(filterPlacesByQuery(places, "it")).includes("Roma"), true);
});

test("every word must match, and no match gives an empty list", () => {
  assert.deepEqual(titles(filterPlacesByQuery(places, "italia roma")), ["Roma"]);
  assert.deepEqual(filterPlacesByQuery(places, "xyz"), []);
});

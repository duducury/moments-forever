import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTINENT_BY_COUNTRY_CODE,
  TROPICAL_COUNTRY_CODES,
} from "./country-continent";
import {
  KNOWN_COUNTRY_CODES,
  countryCodeFromName,
  countryCodeFromPlaceLabel,
  countryFlagFromPlaceLabel,
  countryNameFromCode,
  flagEmojiFromCountryCode,
} from "./country-flag";
import { COUNTRY_NAMES_BY_ISO } from "./country-names.generated";

// "Georgia" is also a US state; the state reading wins for bare names (existing
// behaviour), so the country is only reachable via its other spellings.
const SHADOWED = new Set(["GE:Georgia", "GE:Geórgia"]);

test("Tanzania resolves in every spelling a geocoder or user may produce", () => {
  const labels = [
    "Tanzânia",
    "Tanzania",
    "Tanzânia, Dar es Salaam",
    "Tanzania, Arusha",
    "United Republic of Tanzania",
    "Tanzania, United Republic of",
    "Tanzânia, Zanzibar",
    "Zanzibar",
  ];
  for (const label of labels) {
    assert.equal(countryCodeFromPlaceLabel(label), "TZ", label);
    assert.equal(countryFlagFromPlaceLabel(label), "🇹🇿", label);
  }
  assert.equal(countryNameFromCode("TZ"), "Tanzânia");
});

test("every ISO country resolves from each of its names, with and without a locality", () => {
  assert.ok(KNOWN_COUNTRY_CODES.length >= 240);
  for (const code of KNOWN_COUNTRY_CODES) {
    assert.ok(flagEmojiFromCountryCode(code), `flag for ${code}`);
    assert.ok(countryNameFromCode(code), `pt name for ${code}`);
    for (const name of COUNTRY_NAMES_BY_ISO[code] ?? []) {
      if (SHADOWED.has(`${code}:${name}`)) continue;
      assert.equal(countryCodeFromName(name), code, `${code} ← ${name}`);
      assert.equal(
        countryCodeFromPlaceLabel(`${name}, Algum Lugar`),
        code,
        `${code} ← "${name}, Algum Lugar"`,
      );
    }
  }
});

test("every country has a continent so passport stats never skip it", () => {
  for (const code of KNOWN_COUNTRY_CODES) {
    assert.ok(CONTINENT_BY_COUNTRY_CODE[code], `continent for ${code}`);
  }
  for (const code of Object.keys(CONTINENT_BY_COUNTRY_CODE)) {
    assert.ok(KNOWN_COUNTRY_CODES.includes(code), `${code} is not a known country`);
  }
  for (const code of TROPICAL_COUNTRY_CODES) {
    assert.ok(KNOWN_COUNTRY_CODES.includes(code), `${code} is not a known country`);
  }
});

test("country name table has no cross-country collisions", () => {
  const owner = new Map<string, string>();
  for (const [code, names] of Object.entries(COUNTRY_NAMES_BY_ISO)) {
    for (const name of names) {
      const key = name.toLowerCase();
      const previous = owner.get(key);
      assert.ok(
        !previous || previous === code,
        `"${name}" is used by both ${previous} and ${code}`,
      );
      owner.set(key, code);
    }
  }
});

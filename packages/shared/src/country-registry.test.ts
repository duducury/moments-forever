import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  KNOWN_COUNTRY_CODES,
  countryCodeFromName,
  countryCodeFromPlaceLabel,
  countryCodeFromStoredOrLabel,
  countryNameFromCode,
  countryShortNameFromCode,
  flagEmojiFromCountryCode,
  shortPlaceCaption,
  sovereignCountryOf,
  usStateCodeFromPlaceLabel,
} from "./country-flag";
import { COUNTRY_NAME_ALIASES, PT_BR_NAME_OVERRIDES, SHORT_NAME_BY_CODE, TERRITORY_PARENT } from "./country-registry";

const AUDITED_TERRITORIES = ["PR", "GL", "FO", "AW", "CW", "HK", "MO", "BM", "KY", "GU", "VI", "AS", "NC", "PF"] as const;

test("every country has a pt-BR name, a short name within 22 characters and a flag code", () => {
  for (const code of KNOWN_COUNTRY_CODES) {
    const name = countryNameFromCode(code);
    assert.ok(name, `name ${code}`);
    const short = countryShortNameFromCode(code);
    assert.ok(short && short.length <= 22, `short ${code}: ${short}`);
    assert.ok(flagEmojiFromCountryCode(code), `flag ${code}`);
  }
});

test("every canonical and short name resolves back to its own country (round trip)", () => {
  for (const code of KNOWN_COUNTRY_CODES) {
    for (const name of [countryNameFromCode(code), countryShortNameFromCode(code)]) {
      if (!name || name === "UK") continue;
      // Short names that double as another place ("Emirados", "USA") are still unique per code.
      const back = countryCodeFromName(name);
      assert.ok(back === code || back === null, `${code}: "${name}" resolved to ${back}`);
    }
    assert.equal(countryCodeFromName(countryNameFromCode(code) as string), code, `canonical ${code}`);
    assert.equal(countryCodeFromPlaceLabel(`${countryNameFromCode(code)}, Algum Lugar`), code, `label ${code}`);
  }
});

test("territories keep their own code, name and flag, never their sovereign's", () => {
  const expected: Record<(typeof AUDITED_TERRITORIES)[number], string> = {
    PR: "Porto Rico",
    GL: "Groenlândia",
    FO: "Ilhas Faroé",
    AW: "Aruba",
    CW: "Curaçao",
    HK: "Hong Kong",
    MO: "Macau",
    BM: "Bermudas",
    KY: "Ilhas Cayman",
    GU: "Guam",
    VI: "Ilhas Virgens Americanas",
    AS: "Samoa Americana",
    NC: "Nova Caledônia",
    PF: "Polinésia Francesa",
  };
  for (const code of AUDITED_TERRITORIES) {
    assert.equal(countryNameFromCode(code), expected[code], code);
    assert.equal(countryCodeFromName(expected[code]), code, expected[code]);
    assert.equal(countryCodeFromPlaceLabel(expected[code]), code);
    assert.equal(countryCodeFromPlaceLabel(`${expected[code]}, Capital`), code);
    assert.notEqual(sovereignCountryOf(code), code);
    assert.ok(flagEmojiFromCountryCode(code));
    const parent = sovereignCountryOf(code);
    assert.ok(parent, `parent of ${code}`);
    // A label that names both the sovereign and the territory is the territory.
    assert.equal(countryCodeFromPlaceLabel(`${countryNameFromCode(parent as string)}, ${expected[code]}`), code, code);
    assert.equal(countryCodeFromStoredOrLabel({ storedCode: parent, confirmedByUser: false, labels: [`${countryNameFromCode(parent as string)}, ${expected[code]}`] }), code);
  }
  assert.equal(TERRITORY_PARENT.PR, "US");
  // The sovereign countries stay separate destinations.
  for (const code of ["US", "DK", "NL", "CN", "GB", "FR"]) assert.equal(sovereignCountryOf(code), null);
});

test("Congo pair is not swapped", () => {
  assert.equal(countryNameFromCode("CD"), "República Democrática do Congo");
  assert.equal(countryNameFromCode("CG"), "República do Congo");
  assert.equal(countryCodeFromName("República Democrática do Congo"), "CD");
  assert.equal(countryCodeFromName("Congo-Kinshasa"), "CD");
  assert.equal(countryCodeFromName("República do Congo"), "CG");
  assert.equal(countryCodeFromName("Congo-Brazzaville"), "CG");
  // Legacy Mapa name of the Republic of the Congo.
  assert.equal(countryCodeFromName("República Popular do Congo"), "CG");
});

test("Georgia: the country by itself or with a Georgian city, the US state only as a state", () => {
  assert.equal(countryCodeFromName("Geórgia"), "GE");
  assert.equal(countryCodeFromName("Georgia"), "GE");
  assert.equal(countryCodeFromPlaceLabel("Geórgia"), "GE");
  assert.equal(countryCodeFromPlaceLabel("Geórgia, Tbilisi"), "GE");
  assert.equal(countryCodeFromPlaceLabel("Tbilisi, Georgia"), "GE");
  assert.equal(countryCodeFromPlaceLabel("Batumi, Geórgia"), "GE");
  assert.equal(countryCodeFromPlaceLabel("Atlanta, Georgia"), "US");
  assert.equal(countryCodeFromPlaceLabel("Atlanta, GA"), "US");
  assert.equal(countryCodeFromPlaceLabel("Savannah, Geórgia"), "US");
  assert.equal(usStateCodeFromPlaceLabel("Atlanta, Georgia"), "GA");
  assert.equal(usStateCodeFromPlaceLabel("Tbilisi, Georgia"), null);
  assert.equal(usStateCodeFromPlaceLabel("Georgia"), null);
  assert.equal(countryCodeFromStoredOrLabel({ storedCode: "ge", confirmedByUser: false, labels: ["Geórgia, Tbilisi"] }), "GE");
});

test("captions never cut a long country name mid-word", () => {
  assert.equal(shortPlaceCaption("Ilhas Virgens Americanas")?.shortLabel, "Ilhas Virgens (EUA)");
  assert.equal(shortPlaceCaption("Hong Kong, RAE da China")?.shortLabel, "Hong Kong");
  assert.equal(shortPlaceCaption("Ilhas Marianas do Norte")?.shortLabel, "Ilhas Marianas");
  assert.equal(shortPlaceCaption("Ilhas Virgens Britânicas")?.shortLabel, "Ilhas Virgens (UK)");
  assert.equal(shortPlaceCaption("República Centro-Africana")?.shortLabel, "Rep. Centro-Africana");
  for (const short of Object.values(SHORT_NAME_BY_CODE)) assert.ok(short.length <= 22, short);
});

test("legacy and alternative spellings keep resolving, and aliases never collide across countries", () => {
  const seen = new Map<string, string>();
  for (const [code, names] of Object.entries(COUNTRY_NAME_ALIASES)) {
    assert.ok(KNOWN_COUNTRY_CODES.includes(code), code);
    for (const name of names) {
      assert.equal(countryCodeFromName(name), code, `${name} → ${code}`);
      const key = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      assert.ok(!seen.has(key) || seen.get(key) === code, `alias collision "${name}"`);
      seen.set(key, code);
    }
  }
  for (const code of Object.keys(PT_BR_NAME_OVERRIDES)) assert.ok(KNOWN_COUNTRY_CODES.includes(code), code);
  assert.equal(countryCodeFromName("Gronelândia"), "GL");
  assert.equal(countryCodeFromName("Ilhas Caimão"), "KY");
  assert.equal(countryCodeFromName("Nova Caledónia"), "NC");
});

test("every name stored in the Mapa geo data resolves to its own country", () => {
  const admin = JSON.parse(readFileSync(new URL("../../../apps/web/public/geo/admin-v1.json", import.meta.url), "utf8")) as {
    countries: { c: string; n: string }[];
  };
  for (const country of admin.countries) {
    const stored = country.n;
    // Names stored before this registry existed must still map somewhere sensible…
    const resolved = countryCodeFromName(stored);
    // …except the two Congos, whose old names were swapped (the registry now owns those codes).
    if (country.c === "CD" || country.c === "CG") continue;
    // The Mapa called Sint Maarten (SX) "São Martinho", which is Saint-Martin (MF) in pt-BR: that old stored name
    // stays MF, and new SX places are named "Sint Maarten".
    if (country.c === "SX") {
      assert.equal(countryNameFromCode("SX"), "Sint Maarten");
      continue;
    }
    assert.equal(resolved, country.c, `${country.c} "${stored}" → ${resolved}`);
    assert.ok(countryNameFromCode(country.c), country.c);
  }
});

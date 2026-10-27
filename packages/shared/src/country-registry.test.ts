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

import { relabelForTerritory } from "./country-flag";
import { asUsTerritoryResult, pickTravelPlaceName, usTerritoryOfReverseResult } from "./geocode-place-name";
import { usTerritoryAtCoordinates, usTerritoryFromIso3166Subdivision } from "./country-registry";

test("US territories are told apart by ISO subdivision or by coordinates, never for real US places", () => {
  assert.equal(usTerritoryFromIso3166Subdivision("US-PR"), "PR");
  assert.equal(usTerritoryFromIso3166Subdivision("US-FL"), null);
  assert.equal(usTerritoryFromIso3166Subdivision("BR-SP"), null);
  // San Juan, Vieques, Culebra, St. Thomas, Hagåtña, Pago Pago.
  assert.equal(usTerritoryAtCoordinates(18.4655, -66.1057), "PR");
  assert.equal(usTerritoryAtCoordinates(18.1263, -65.4401), "PR");
  assert.equal(usTerritoryAtCoordinates(18.3, -65.3), "PR");
  assert.equal(usTerritoryAtCoordinates(18.3358, -64.8963), "VI");
  assert.equal(usTerritoryAtCoordinates(13.4443, 144.7937), "GU");
  assert.equal(usTerritoryAtCoordinates(-14.2756, -170.702), "AS");
  // Miami, Key West, Honolulu, Anchorage, Tortola (British), Santo Domingo.
  for (const [lat, lon] of [[25.7617, -80.1918], [24.5551, -81.78], [21.3069, -157.8583], [61.2181, -149.9003], [18.43, -64.62], [18.4861, -69.9312]] as const) {
    assert.equal(usTerritoryAtCoordinates(lat, lon), null, `${lat},${lon}`);
  }
  assert.equal(usTerritoryAtCoordinates(null, null), null);
});

test("a Nominatim answer for San Juan is the territory PR; Miami is not", () => {
  const sanJuan = {
    addresstype: "city",
    name: "San Juan",
    address: { city: "San Juan", state: "Porto Rico", "ISO3166-2-lvl4": "US-PR", country: "Estados Unidos da América", country_code: "us" },
  };
  assert.equal(usTerritoryOfReverseResult(sanJuan), "PR");
  assert.equal(pickTravelPlaceName(sanJuan), "Porto Rico, San Juan");
  assert.equal(asUsTerritoryResult(sanJuan, "PR").address?.country_code, "pr");
  const miami = { addresstype: "city", name: "Miami", address: { city: "Miami", state: "Flórida", "ISO3166-2-lvl4": "US-FL", country: "Estados Unidos da América", country_code: "us" } };
  assert.equal(usTerritoryOfReverseResult(miami, 25.7617, -80.1918), null);
  assert.equal(pickTravelPlaceName(miami), "Estados Unidos, Miami");
  // Filed under another country: coordinates alone never make it a US territory.
  assert.equal(usTerritoryOfReverseResult({ address: { island: "Tortola", country: "Ilhas Virgens Britânicas", country_code: "vg" } }, 18.4, -64.6), null);
});

test("relabelForTerritory swaps only the sovereign country part", () => {
  assert.equal(relabelForTerritory("Estados Unidos da América, San Juan", "PR"), "Porto Rico, San Juan");
  assert.equal(relabelForTerritory("Estados Unidos, Vieques", "PR"), "Porto Rico, Vieques");
  assert.equal(relabelForTerritory("Estados Unidos", "PR"), "Porto Rico");
  assert.equal(relabelForTerritory("Porto Rico, San Juan", "PR"), "Porto Rico, San Juan");
  assert.equal(relabelForTerritory("Meu verão em Culebra", "PR"), "Meu verão em Culebra");
  assert.equal(relabelForTerritory("França, Paris", "PR"), "França, Paris");
  assert.equal(countryCodeFromPlaceLabel(relabelForTerritory("Estados Unidos da América, San Juan", "PR")), "PR");
});

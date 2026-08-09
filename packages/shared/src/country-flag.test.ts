import assert from "node:assert/strict";
import test from "node:test";

import {
  countryCodeFromName,
  countryCodeFromPlaceLabel,
  countryFlagFromPlaceLabel,
  flagEmojiFromCountryCode,
  shortPlaceCaption,
} from "./country-flag";

test("countryCodeFromName maps EN and PT labels with accents", () => {
  assert.equal(countryCodeFromName("Indonesia"), "ID");
  assert.equal(countryCodeFromName("Indonésia"), "ID");
  assert.equal(countryCodeFromName("United Arab Emirates"), "AE");
  assert.equal(countryCodeFromName("Emirados Árabes Unidos"), "AE");
  assert.equal(countryCodeFromName("Estados Unidos da América"), "US");
});

test("flagEmojiFromCountryCode builds regional indicators", () => {
  assert.equal(flagEmojiFromCountryCode("ID"), "🇮🇩");
  assert.equal(flagEmojiFromCountryCode("ae"), "🇦🇪");
  assert.equal(flagEmojiFromCountryCode("X"), null);
});

test("countryCodeFromPlaceLabel reads País, Localidade", () => {
  assert.equal(
    countryCodeFromPlaceLabel("Indonésia, Klungkung Regency"),
    "ID",
  );
  assert.equal(
    countryCodeFromPlaceLabel("Emirados Árabes Unidos, Deira"),
    "AE",
  );
  assert.equal(countryCodeFromPlaceLabel("Brasil"), "BR");
  assert.equal(countryCodeFromPlaceLabel(null), null);
});

test("countryCodeFromPlaceLabel accepts short trip names", () => {
  assert.equal(countryCodeFromPlaceLabel("dubai"), "AE");
  assert.equal(countryCodeFromPlaceLabel("Dubai"), "AE");
  assert.equal(countryCodeFromPlaceLabel("usa"), "US");
  assert.equal(countryCodeFromPlaceLabel("indonesia"), "ID");
  assert.equal(countryCodeFromPlaceLabel("bali"), "ID");
  assert.equal(countryCodeFromPlaceLabel("emirados"), "AE");
});

test("countryFlagFromPlaceLabel still returns emoji when known", () => {
  assert.equal(
    countryFlagFromPlaceLabel("Indonésia, Klungkung Regency"),
    "🇮🇩",
  );
});

test("shortPlaceCaption abbreviates with country flag code", () => {
  assert.deepEqual(shortPlaceCaption("usa"), {
    countryCode: "US",
    shortLabel: "USA",
  });
  assert.deepEqual(shortPlaceCaption("Indonésia, Klungkung Regency"), {
    countryCode: "ID",
    shortLabel: "Indonésia",
  });
  assert.deepEqual(shortPlaceCaption("hawaii"), {
    countryCode: "US",
    shortLabel: "Havaí",
  });
  assert.deepEqual(shortPlaceCaption("rio"), {
    countryCode: "BR",
    shortLabel: "Rio",
  });
  assert.deepEqual(shortPlaceCaption("dubai"), {
    countryCode: "AE",
    shortLabel: "Dubai",
  });
});

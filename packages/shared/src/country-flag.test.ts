import assert from "node:assert/strict";
import test from "node:test";

import {
  countryCodeFromName,
  countryCodeFromPlaceLabel,
  countryCodeFromStoredOrLabel,
  countryNameFromCode,
  countryFlagFromPlaceLabel,
  flagEmojiFromCountryCode,
  shortPlaceCaption,
  usStateCodeFromPlaceLabel,
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
  assert.equal(countryCodeFromPlaceLabel("Jamaica"), "JM");
  assert.equal(countryCodeFromPlaceLabel("jamaica"), "JM");
  assert.equal(
    countryCodeFromPlaceLabel("Jamaica, Montego Bay"),
    "JM",
  );
  assert.equal(countryCodeFromPlaceLabel("Montego Bay, Jamaica"), "JM");
  assert.equal(countryCodeFromPlaceLabel("Negril"), "JM");
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

test("US city, state labels resolve to USA flag and state short label", () => {
  assert.equal(usStateCodeFromPlaceLabel("Cleveland, OH"), "OH");
  assert.equal(usStateCodeFromPlaceLabel("Boston, MA"), "MA");
  assert.equal(usStateCodeFromPlaceLabel("Hartford, CT"), "CT");
  assert.equal(usStateCodeFromPlaceLabel("Los Angeles, CA"), "CA");
  assert.equal(usStateCodeFromPlaceLabel("Ohio"), "OH");
  assert.equal(countryCodeFromPlaceLabel("Cleveland, OH"), "US");
  assert.equal(countryCodeFromPlaceLabel("Boston, MA"), "US");
  assert.equal(countryCodeFromPlaceLabel("Los Angeles, CA"), "US");
  assert.deepEqual(shortPlaceCaption("Cleveland, OH"), {
    countryCode: "US",
    shortLabel: "OH",
  });
  assert.deepEqual(shortPlaceCaption("Boston, MA"), {
    countryCode: "US",
    shortLabel: "MA",
  });
  assert.deepEqual(shortPlaceCaption("Hartford, CT"), {
    countryCode: "US",
    shortLabel: "CT",
  });
  // Country name still wins over a bare colliding token elsewhere.
  assert.equal(countryCodeFromPlaceLabel("Marrocos"), "MA");
  assert.equal(countryCodeFromPlaceLabel("Canada"), "CA");
});

test("Porto Rico é um destino próprio (🇵🇷), separado dos Estados Unidos (🇺🇸)", () => {
  for (const label of [
    "Porto Rico",
    "Puerto Rico",
    "San Juan, Porto Rico",
    "Porto Rico, San Juan",
    "San Juan, PR",
    "Estados Unidos, Porto Rico",
    "Porto Rico, Estados Unidos",
    "United States, Puerto Rico",
    "Culebra, Porto Rico, Estados Unidos",
    "San Juan, Puerto Rico, United States",
  ]) {
    assert.equal(countryCodeFromPlaceLabel(label), "PR", label);
    assert.equal(countryFlagFromPlaceLabel(label), "🇵🇷", label);
  }
  for (const label of ["Estados Unidos", "United States", "Estados Unidos, Miami", "Cleveland, OH", "Estados Unidos, Flórida"]) {
    assert.equal(countryCodeFromPlaceLabel(label), "US", label);
  }
  assert.equal(shortPlaceCaption("Estados Unidos, Porto Rico")?.shortLabel, "Porto Rico");
  assert.equal(shortPlaceCaption("Puerto Rico, United States")?.shortLabel, "Porto Rico");
  assert.equal(countryNameFromCode("PR"), "Porto Rico");
  assert.equal(countryNameFromCode("US"), "Estados Unidos");
  // O geocoder pode arquivar Porto Rico como "us": o nome do lugar, mais específico, vence.
  assert.equal(
    countryCodeFromStoredOrLabel({ storedCode: "us", confirmedByUser: false, labels: ["Estados Unidos, Porto Rico"] }),
    "PR",
  );
  assert.equal(
    countryCodeFromStoredOrLabel({ storedCode: "us", confirmedByUser: false, labels: ["Estados Unidos, Miami"] }),
    "US",
  );
  assert.equal(
    countryCodeFromStoredOrLabel({ storedCode: "pr", confirmedByUser: false, labels: ["Estados Unidos, Porto Rico"] }),
    "PR",
  );
});

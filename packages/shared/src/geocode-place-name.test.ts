import assert from "node:assert/strict";
import test from "node:test";

import { canApplySuggestedPlaceName } from "./location-name.ts";
import {
  applySuggestedNamesById,
  collectGeocodeLookups,
  formatCountryLocality,
  geocodeCacheKey,
  localizeCountryName,
  pickTravelPlaceName,
} from "./geocode-place-name.ts";

test("pickTravelPlaceName prefers island/city as País, Localidade", () => {
  assert.equal(
    pickTravelPlaceName({
      name: "Jl. Raya Toya Pakeh",
      addresstype: "road",
      address: {
        road: "Jl. Raya Toya Pakeh",
        village: "Sakti",
        island: "Nusa Penida",
        state: "Bali",
        country: "Indonesia",
      },
    }),
    "Indonésia, Nusa Penida",
  );

  assert.equal(
    pickTravelPlaceName({
      name: "Rio de Janeiro",
      addresstype: "city",
      address: {
        city: "Rio de Janeiro",
        state: "Rio de Janeiro",
        country: "Brazil",
      },
    }),
    "Brasil, Rio de Janeiro",
  );

  assert.equal(
    pickTravelPlaceName({
      name: "Miami",
      addresstype: "city",
      address: {
        city: "Miami",
        state: "Florida",
        country: "United States",
      },
    }),
    "Estados Unidos, Miami",
  );
});

test("pickTravelPlaceName returns null without useful locality", () => {
  assert.equal(
    pickTravelPlaceName({
      name: null,
      addresstype: "road",
      address: {
        road: "Unnamed Road",
        house_number: "12",
      },
    }),
    null,
  );
  assert.equal(
    pickTravelPlaceName({
      name: "Jl. Raya Toya Pakeh No. 1",
      addresstype: "road",
      address: {
        road: "Jl. Raya Toya Pakeh No. 1",
      },
    }),
    null,
  );
});

test("localizeCountryName maps common English names to PT", () => {
  assert.equal(localizeCountryName("Indonesia"), "Indonésia");
  assert.equal(localizeCountryName("Brazil"), "Brasil");
  assert.equal(localizeCountryName("Indonésia"), "Indonésia");
});

test("formatCountryLocality builds País, Localidade", () => {
  assert.equal(
    formatCountryLocality("Indonesia", "Bali"),
    "Indonésia, Bali",
  );
  assert.equal(formatCountryLocality(null, "Ubud"), "Ubud");
  assert.equal(formatCountryLocality("Brazil", null), "Brasil");
});

test("collectGeocodeLookups: 10 photos same place → 1 lookup", () => {
  const targets = Array.from({ length: 10 }, (_, index) => ({
    id: `place-${index}`,
    latitude: -8.7275,
    longitude: 115.5444,
    name: `Local ${index + 1}`,
    confirmedByUser: false,
  }));

  const lookups = collectGeocodeLookups(targets, canApplySuggestedPlaceName);
  assert.equal(lookups.length, 1);
  assert.equal(lookups[0]?.targetIds.length, 10);
});

test("collectGeocodeLookups skips places without GPS and confirmed names", () => {
  const lookups = collectGeocodeLookups(
    [
      {
        id: "a",
        latitude: Number.NaN,
        longitude: 10,
        name: "Local 1",
        confirmedByUser: false,
      },
      {
        id: "b",
        latitude: -8.7,
        longitude: 115.5,
        name: "Hotel da viagem",
        confirmedByUser: true,
      },
      {
        id: "c",
        latitude: -8.7,
        longitude: 115.5,
        name: "Local 3",
        confirmedByUser: false,
      },
    ],
    canApplySuggestedPlaceName,
  );

  assert.equal(lookups.length, 1);
  assert.deepEqual(lookups[0]?.targetIds, ["c"]);
});

test("geocodeCacheKey rounds coordinates for reuse", () => {
  assert.equal(
    geocodeCacheKey(-8.7274, 115.5444),
    geocodeCacheKey(-8.72749, 115.54444),
  );
  assert.equal(geocodeCacheKey(-8.7274, 115.5444), "-8.727,115.544");
});

test("applySuggestedNamesById updates matching ids only", () => {
  const next = applySuggestedNamesById(
    [
      { id: "1", name: "Local 1" },
      { id: "2", name: "Local 2" },
    ],
    new Map([["1", "Indonésia, Nusa Penida"]]),
  );
  assert.equal(next[0]?.name, "Indonésia, Nusa Penida");
  assert.equal(next[1]?.name, "Local 2");
});

test("manual confirmed name is protected by canApplySuggestedPlaceName", () => {
  assert.equal(
    canApplySuggestedPlaceName({
      name: "Hotel da viagem",
      confirmedByUser: true,
    }),
    false,
  );
  assert.equal(
    canApplySuggestedPlaceName({
      name: "Local 1",
      confirmedByUser: false,
    }),
    true,
  );
});

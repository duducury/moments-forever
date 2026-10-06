import assert from "node:assert/strict";
import test from "node:test";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
import { countryCodeFromPlaceLabel } from "@moments-forever/shared";

import { buildPassport } from "./build-passport";

function card(title: string, id: string): OwnerPlaceCardItem {
  return {
    albumId: id,
    experienceId: `exp-${id}`,
    experienceSlug: `trip-${id}`,
    experienceTitle: title,
    title,
    countryCode: countryCodeFromPlaceLabel(title),
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2026-09-05T00:00:00.000Z",
    coverPhotoId: null,
    coverFocus: null,
    previewPhotoIds: [],
    photoCount: 3,
  };
}

test("a Tanzania trip gets a passport stamp with the country name and continent", () => {
  const passport = buildPassport(
    [card("Tanzânia, Zanzibar", "a"), card("Brasil, Rio de Janeiro", "b")],
    null,
  );
  const tz = passport.countries.find((country) => country.code === "TZ");
  assert.ok(tz, "TZ stamp missing");
  assert.equal(tz.name, "Tanzânia");
  assert.equal(tz.tripCount, 1);
  assert.equal(passport.countryCount, 2);
  assert.ok(passport.continents.includes("África"));
});

test("countries that were never hand-listed still get a stamp", () => {
  const labels = [
    "Mongólia, Ulaanbaatar",
    "Madagascar, Antananarivo",
    "Bhutan, Paro",
    "Uganda, Kampala",
    "Namibia, Windhoek",
  ];
  const passport = buildPassport(
    labels.map((label, index) => card(label, String(index))),
    null,
  );
  assert.equal(passport.countryCount, labels.length);
  for (const country of passport.countries) {
    assert.notEqual(country.name, country.code);
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildTripHeroDisplay } from "@/app/trip/[slug]/trip-display";

const base = {
  title: "Férias em Bali",
  startsAt: "2026-03-02T12:00:00Z",
  endsAt: "2026-03-10T12:00:00Z",
  primaryCity: "Ubud",
  primaryCountry: "Indonésia",
};

test("hero shows location line and flag code from the trip country", () => {
  const hero = buildTripHeroDisplay(base, []);
  assert.equal(hero.locationLine, "Ubud, Indonésia");
  assert.equal(hero.countryCode, "ID");
  assert.match(hero.title, /Férias em Bali/u);
});

test("hero without any geography has no location and no flag", () => {
  const hero = buildTripHeroDisplay(
    { ...base, primaryCity: null, primaryCountry: null, title: "Nova viagem" },
    [],
  );
  assert.equal(hero.countryCode, null);
  assert.equal(hero.locationLine, null);
});

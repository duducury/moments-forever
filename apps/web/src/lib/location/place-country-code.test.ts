import assert from "node:assert/strict";
import test from "node:test";

import { countryCodeFromStoredOrLabel } from "@moments-forever/shared";

import { clearGeocodeMemoryCache } from "./geocode-memory-cache";
import { createNominatimClient } from "./nominatim-client";
import { persistExperiencePlaceCountryCodes } from "./place-country-code";

/** Records updates; serves a fixed list of unresolved places. */
function fakeSupabase(
  places: readonly Record<string, unknown>[],
  updates: { code: string; ids: string[] }[],
) {
  return {
    from(table: string) {
      if (table !== "places") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          const chain = {
            in: () => chain,
            is: () => Promise.resolve({ data: places, error: null }),
          };
          return chain;
        },
        update(values: { country_code: string }) {
          return {
            in(_column: string, ids: string[]) {
              updates.push({ code: values.country_code, ids });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof persistExperiencePlaceCountryCodes>[0];
}

function geocoderReturning(address: Record<string, string>, calls: string[]) {
  return createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ name: "Somewhere", addresstype: "city", address }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
}

test("stored code wins for geocoded places, the label wins for user-renamed ones", () => {
  assert.equal(
    countryCodeFromStoredOrLabel({
      storedCode: "tz",
      confirmedByUser: false,
      labels: ["Lugar 1"],
    }),
    "TZ",
  );
  assert.equal(
    countryCodeFromStoredOrLabel({
      storedCode: "TZ",
      confirmedByUser: true,
      labels: ["França, Paris"],
    }),
    "FR",
  );
  assert.equal(
    countryCodeFromStoredOrLabel({
      storedCode: null,
      confirmedByUser: false,
      labels: ["Tanzânia, Zanzibar"],
    }),
    "TZ",
  );
  assert.equal(
    countryCodeFromStoredOrLabel({
      storedCode: "ZZ",
      confirmedByUser: false,
      labels: ["Lugar 2"],
    }),
    null,
  );
});

test("country_code comes from the geocoder when the name says nothing about the country", async () => {
  clearGeocodeMemoryCache();
  const updates: { code: string; ids: string[] }[] = [];
  const calls: string[] = [];
  const supabase = fakeSupabase(
    [
      {
        id: "p1",
        name: "Zanzíbar Urbano",
        exact_latitude: -6.1659,
        exact_longitude: 39.2026,
        confirmed_by_user: false,
      },
    ],
    updates,
  );
  const client = geocoderReturning(
    { city: "Zanzibar", country: "Tanzania", country_code: "tz" },
    calls,
  );

  const updated = await persistExperiencePlaceCountryCodes(supabase, "exp-1", {
    client,
  });
  assert.equal(updated, 1);
  assert.deepEqual(updates, [{ code: "TZ", ids: ["p1"] }]);
  assert.equal(calls.length, 1);
});

test("a place whose name already carries the country needs no network call", async () => {
  clearGeocodeMemoryCache();
  const updates: { code: string; ids: string[] }[] = [];
  const calls: string[] = [];
  const supabase = fakeSupabase(
    [
      {
        id: "p1",
        name: "Tanzânia, Arusha",
        exact_latitude: -3.3869,
        exact_longitude: 36.683,
        confirmed_by_user: false,
      },
      { id: "p2", name: "Lugar 2", exact_latitude: null, exact_longitude: null, confirmed_by_user: false },
    ],
    updates,
  );
  const client = geocoderReturning({ country_code: "xx" }, calls);

  await persistExperiencePlaceCountryCodes(supabase, "exp-1", { client });
  assert.deepEqual(updates, [{ code: "TZ", ids: ["p1"] }]);
  assert.equal(calls.length, 0);
});

test("never throws and ignores invalid geocoder codes", async () => {
  clearGeocodeMemoryCache();
  const updates: { code: string; ids: string[] }[] = [];
  const supabase = fakeSupabase(
    [
      {
        id: "p1",
        name: "Lugar 1",
        exact_latitude: 1,
        exact_longitude: 1,
        confirmed_by_user: false,
      },
    ],
    updates,
  );
  const client = geocoderReturning({ country_code: "zz" }, []);
  const updated = await persistExperiencePlaceCountryCodes(supabase, "exp-1", {
    client,
  });
  assert.equal(updated, 0);
  assert.deepEqual(updates, []);
});

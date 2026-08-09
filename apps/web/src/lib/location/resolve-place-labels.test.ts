import assert from "node:assert/strict";
import test from "node:test";

import type { ExperienceImportDraft } from "@moments-forever/types";

import {
  clearGeocodeMemoryCache,
  geocodeMemoryCacheSize,
} from "./geocode-memory-cache";
import { createNominatimClient } from "./nominatim-client";
import {
  enrichImportDraftPlaces,
  resolveLabelsForCoordinates,
} from "./resolve-place-labels";

function draftWithPlaces(
  places: ExperienceImportDraft["places"],
): ExperienceImportDraft {
  return {
    experience: {
      id: "experience:1",
      ownerId: "00000000-0000-4000-8000-000000000001",
      slug: "bali-2026",
      title: "Bali 2026",
      description: null,
      startsAt: null,
      endsAt: null,
      primaryCity: null,
      primaryCountry: null,
      coverPhotoId: null,
      status: "draft",
      visibility: "private",
    },
    places,
    moments: places.map((place, index) => ({
      id: `moment:${place.id}`,
      experienceId: "experience:1",
      placeId: place.id,
      title: place.name,
      position: index + 1,
      startsAt: null,
      endsAt: null,
      confirmedByUser: true,
    })),
    photos: [],
  };
}

test("enrichImportDraftPlaces: valid GPS gets name; service error keeps Local N", async () => {
  clearGeocodeMemoryCache();
  let calls = 0;
  const client = createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            addresstype: "island",
            name: "Nusa Penida",
            address: { island: "Nusa Penida" },
          }),
          { status: 200 },
        );
      }
      return new Response("boom", { status: 500 });
    },
  });

  const input = draftWithPlaces([
    {
      id: "place:a",
      experienceId: "experience:1",
      name: "Local 1",
      exactLatitude: -8.7275,
      exactLongitude: 115.5444,
      locationSource: "gps",
      confirmedByUser: false,
    },
    {
      id: "place:b",
      experienceId: "experience:1",
      name: "Local 2",
      exactLatitude: -6.9667,
      exactLongitude: 110.4167,
      locationSource: "gps",
      confirmedByUser: false,
    },
  ]);

  const { draft } = await enrichImportDraftPlaces(input, { client });
  assert.equal(draft.places[0]?.name, "Nusa Penida");
  assert.equal(draft.places[1]?.name, "Local 2");
  assert.equal(calls, 2);
});

test("enrichImportDraftPlaces: 10 photos same place → 1 network call", async () => {
  clearGeocodeMemoryCache();
  let calls = 0;
  const client = createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          addresstype: "city",
          name: "Semarang",
          address: { city: "Semarang" },
        }),
        { status: 200 },
      );
    },
  });

  // One place representing a 10-photo cluster (import is already place-grouped).
  const input = draftWithPlaces([
    {
      id: "place:cluster",
      experienceId: "experience:1",
      name: "Local 1",
      exactLatitude: -6.9667,
      exactLongitude: 110.4167,
      locationSource: "gps",
      confirmedByUser: false,
    },
  ]);

  const { draft, stats } = await enrichImportDraftPlaces(input, { client });
  assert.equal(draft.places[0]?.name, "Semarang");
  assert.equal(calls, 1);
  assert.equal(stats.networkCount, 1);
});

test("manual confirmed name is not overwritten", async () => {
  clearGeocodeMemoryCache();
  let calls = 0;
  const client = createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          addresstype: "island",
          name: "Nusa Penida",
          address: { island: "Nusa Penida" },
        }),
        { status: 200 },
      );
    },
  });

  const input = draftWithPlaces([
    {
      id: "place:manual",
      experienceId: "experience:1",
      name: "Hotel da viagem",
      exactLatitude: -8.7275,
      exactLongitude: 115.5444,
      locationSource: "gps",
      confirmedByUser: true,
    },
  ]);

  const { draft, stats } = await enrichImportDraftPlaces(input, { client });
  assert.equal(draft.places[0]?.name, "Hotel da viagem");
  assert.equal(calls, 0);
  assert.equal(stats.lookupCount, 0);
});

test("place without GPS does not call Nominatim", async () => {
  clearGeocodeMemoryCache();
  let calls = 0;
  const client = createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    },
  });

  const input = draftWithPlaces([
    {
      id: "place:nogps",
      experienceId: "experience:1",
      name: "Local 1",
      exactLatitude: null,
      exactLongitude: null,
      locationSource: null,
      confirmedByUser: false,
    },
  ]);

  await enrichImportDraftPlaces(input, { client });
  assert.equal(calls, 0);
});

test("empty useful name keeps fallback and cache avoids repeat call", async () => {
  clearGeocodeMemoryCache();
  let calls = 0;
  const client = createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          addresstype: "road",
          name: "Unnamed Road",
          address: { road: "Unnamed Road", house_number: "1" },
        }),
        { status: 200 },
      );
    },
  });

  const points = [
    { key: "1.000,2.000", latitude: 1, longitude: 2 },
    { key: "1.000,2.000", latitude: 1, longitude: 2 },
  ];

  const first = await resolveLabelsForCoordinates(points.slice(0, 1), {
    client,
  });
  assert.equal(first.labels.size, 0);
  assert.equal(calls, 1);

  const second = await resolveLabelsForCoordinates(points, { client });
  assert.equal(calls, 1);
  assert.equal(second.stats.networkCount, 0);
  assert.ok(geocodeMemoryCacheSize() >= 1);
});

test("enrichImportDraftPlaces never throws when client explodes", async () => {
  clearGeocodeMemoryCache();
  const client = createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });

  const input = draftWithPlaces([
    {
      id: "place:x",
      experienceId: "experience:1",
      name: "Local 1",
      exactLatitude: 10,
      exactLongitude: 20,
      locationSource: "gps",
      confirmedByUser: false,
    },
  ]);

  const { draft } = await enrichImportDraftPlaces(input, { client });
  assert.equal(draft.places[0]?.name, "Local 1");
});

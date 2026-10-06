import assert from "node:assert/strict";
import test from "node:test";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";

import {
  buildExistingTrips,
  buildKnownAssets,
  buildLegacyPhotos,
  rootAlbumResolver,
  type AlbumRow,
  type PhotoRow,
} from "./existing-trips";

const albums: AlbumRow[] = [
  { id: "root", experience_id: "e1", parent_album_id: null },
  { id: "child", experience_id: "e1", parent_album_id: "root" },
  { id: "other", experience_id: "e2", parent_album_id: null },
];

function photo(overrides: Partial<PhotoRow>): PhotoRow {
  return {
    experience_id: "e1",
    album_id: "root",
    captured_at: "2026-06-10T10:00:00Z",
    exact_latitude: 48.85,
    exact_longitude: 2.35,
    width: 1600,
    height: 1200,
    source_asset_id: null,
    ...overrides,
  };
}

function card(overrides: Partial<OwnerPlaceCardItem> = {}): OwnerPlaceCardItem {
  return {
    albumId: "root",
    experienceId: "e1",
    experienceSlug: "paris",
    experienceTitle: "Paris",
    title: "França, Paris",
    countryCode: "FR",
    startsAt: "2026-06-10T10:00:00Z",
    endsAt: "2026-06-12T10:00:00Z",
    coverPhotoId: null,
    coverFocus: null,
    previewPhotoIds: [],
    photoCount: 3,
    ...overrides,
  };
}

test("photos in sub-albums roll up to the root album (the profile card)", () => {
  const rootOf = rootAlbumResolver(albums);
  assert.equal(rootOf("child"), "root");
  assert.equal(rootOf("root"), "root");
  assert.equal(rootOf(null), null);
});

test("each existing trip gets the center and spread of its geotagged photos", () => {
  const [trip] = buildExistingTrips({
    cards: [card()],
    albums,
    photos: [
      photo({ album_id: "root", exact_latitude: 48.8, exact_longitude: 2.3 }),
      photo({ album_id: "child", exact_latitude: 48.9, exact_longitude: 2.4 }),
      photo({ album_id: "root", exact_latitude: null, exact_longitude: null }),
    ],
  });
  assert.ok(trip?.center);
  assert.ok(Math.abs((trip?.center?.latitude ?? 0) - 48.85) < 0.01);
  assert.ok((trip?.radiusKm ?? 0) > 0);
  assert.equal(trip?.title, "França, Paris");
});

test("a trip without any GPS has no center (so it can only be matched by country)", () => {
  const [trip] = buildExistingTrips({
    cards: [card()],
    albums,
    photos: [photo({ exact_latitude: null, exact_longitude: null })],
  });
  assert.equal(trip?.center, null);
  assert.equal(trip?.radiusKm, null);
});

test("known assets are the photos that remember their origin, attributed to the root album", () => {
  const known = buildKnownAssets(
    [
      photo({ album_id: "child", source_asset_id: "ios:AAA" }),
      photo({ source_asset_id: null }),
    ],
    albums,
  );
  assert.deepEqual(known, [{ assetId: "ios:AAA", experienceId: "e1", albumId: "root" }]);
});

test("legacy photos are only those without an origin, only for the asked trips, and need a date", () => {
  const legacy = buildLegacyPhotos(
    [
      photo({ source_asset_id: "ios:AAA" }),
      photo({ experience_id: "e2", album_id: "other" }),
      photo({ captured_at: null }),
      photo({}),
    ],
    new Set(["e1"]),
  );
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0]?.experienceId, "e1");
});

import assert from "node:assert/strict";
import test from "node:test";

import { sortAlbumPhotos, type TripPhoto } from "../../app/trip/[slug]/album-types";

function photo(id: string, positionInAlbum: number): TripPhoto {
  return {
    id,
    albumId: "album",
    momentId: "moment",
    positionInAlbum,
    positionInMoment: positionInAlbum,
    capturedAt: null,
    width: 100,
    height: 100,
    exactLatitude: null,
    exactLongitude: null,
    locationLabel: null,
  };
}

test("sortAlbumPhotos without a cover keeps position order", () => {
  const photos = [photo("a", 1), photo("b", 2), photo("c", 3)];
  assert.deepEqual(
    sortAlbumPhotos(photos, null).map((item) => item.id),
    ["a", "b", "c"],
  );
});

test("sortAlbumPhotos keeps position order when cover is already first", () => {
  const photos = [photo("a", 1), photo("b", 2), photo("c", 3)];
  assert.deepEqual(
    sortAlbumPhotos(photos, "a").map((item) => item.id),
    ["a", "b", "c"],
  );
});

test("sortAlbumPhotos moves cover to the front so grid and lightbox match", () => {
  const photos = [photo("a", 1), photo("b", 2), photo("c", 3)];
  assert.deepEqual(
    sortAlbumPhotos(photos, "b").map((item) => item.id),
    ["b", "a", "c"],
  );
});

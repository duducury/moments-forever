import assert from "node:assert/strict";
import test from "node:test";

import { pickPrimaryAlbumId } from "./pick-primary-album";

test("picks the lowest-position root album", () => {
  const albumId = pickPrimaryAlbumId([
    { id: "bali", position: 1 },
    { id: "dubai", position: 2 },
  ]);
  assert.equal(albumId, "bali");
});

test("is stable regardless of input order", () => {
  const albumId = pickPrimaryAlbumId([
    { id: "dubai", position: 2 },
    { id: "bali", position: 1 },
  ]);
  assert.equal(albumId, "bali");
});

test("returns null when the experience has no root albums", () => {
  assert.equal(pickPrimaryAlbumId([]), null);
});

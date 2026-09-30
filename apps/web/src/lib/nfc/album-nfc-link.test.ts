import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNfcTagRequestBody,
  canShowVincularNfcAction,
} from "./album-nfc-link";

test("shows the action for the owner on a root album (e.g. Bali)", () => {
  assert.equal(
    canShowVincularNfcAction({ isOwner: true, parentAlbumId: null }),
    true,
  );
});

test("hides the action for a non-owner, even on a root album", () => {
  assert.equal(
    canShowVincularNfcAction({ isOwner: false, parentAlbumId: null }),
    false,
  );
});

test("hides the action for an unauthenticated visitor (isOwner is always false)", () => {
  assert.equal(
    canShowVincularNfcAction({ isOwner: false, parentAlbumId: null }),
    false,
  );
});

test("hides the action on a subálbum, even for the owner", () => {
  assert.equal(
    canShowVincularNfcAction({ isOwner: true, parentAlbumId: "parent-1" }),
    false,
  );
});

test("Bali: request body carries Bali's own albumId", () => {
  const body = buildNfcTagRequestBody({
    experienceId: "trip-1",
    albumId: "bali",
  });
  assert.deepEqual(body, { experienceId: "trip-1", albumId: "bali" });
});

test("Dubai: request body carries Dubai's own albumId, not Bali's", () => {
  const body = buildNfcTagRequestBody({
    experienceId: "trip-1",
    albumId: "dubai",
  });
  assert.deepEqual(body, { experienceId: "trip-1", albumId: "dubai" });
});

test("Bali and Dubai under the same experience produce independent request bodies", () => {
  const bali = buildNfcTagRequestBody({
    experienceId: "trip-1",
    albumId: "bali",
  });
  const dubai = buildNfcTagRequestBody({
    experienceId: "trip-1",
    albumId: "dubai",
  });
  assert.notEqual(bali.albumId, dubai.albumId);
  assert.equal(bali.experienceId, dubai.experienceId);
});

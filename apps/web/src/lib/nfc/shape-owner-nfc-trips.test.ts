import assert from "node:assert/strict";
import test from "node:test";

import type { OwnerPlaceCardItem } from "../experiences/load-owner-place-cards";
import { shapeOwnerNfcTrips } from "./shape-owner-nfc-trips";

function place(overrides: Partial<OwnerPlaceCardItem>): OwnerPlaceCardItem {
  return {
    albumId: "album-default",
    experienceId: "experience-default",
    experienceSlug: "slug",
    experienceTitle: "Título",
    title: "Título",
    countryCode: null,
    startsAt: null,
    endsAt: null,
    coverPhotoId: null,
    coverFocus: null,
    previewPhotoIds: [],
    photoCount: 0,
    ...overrides,
  };
}

test("two destinations under the same experience never share a tag", () => {
  // Exactly the reported bug's shape: one experience ("uma viagem só"), two
  // root albums ("Dubai" and "Bali") — same experienceId, different albumId.
  const dubai = place({
    albumId: "album-dubai",
    experienceId: "experience-shared",
    title: "Dubai",
  });
  const bali = place({
    albumId: "album-bali",
    experienceId: "experience-shared",
    title: "Bali",
  });

  const tokenByAlbumId = new Map([["album-dubai", "tok-dubai"]]);
  const trips = shapeOwnerNfcTrips(
    [dubai, bali],
    tokenByAlbumId,
    (token) => `https://momentsforever.vercel.app/n/${token}`,
  );

  assert.equal(trips.length, 2, "both destinations must appear, never deduped");

  const dubaiTrip = trips.find((t) => t.title === "Dubai");
  const baliTrip = trips.find((t) => t.title === "Bali");
  assert.ok(dubaiTrip && baliTrip);

  assert.equal(dubaiTrip.nfcUrl, "https://momentsforever.vercel.app/n/tok-dubai");
  assert.equal(
    baliTrip.nfcUrl,
    null,
    "Bali has no tag of its own — it must NOT inherit Dubai's",
  );

  // The one guarantee this whole fix exists for.
  assert.notEqual(dubaiTrip.nfcUrl, baliTrip.nfcUrl);
});

test("each destination's tag is looked up strictly by its own albumId", () => {
  const dubai = place({ albumId: "album-dubai", title: "Dubai" });
  const bali = place({ albumId: "album-bali", title: "Bali" });
  const tokenByAlbumId = new Map([
    ["album-dubai", "tok-dubai"],
    ["album-bali", "tok-bali"],
  ]);

  const trips = shapeOwnerNfcTrips(
    [dubai, bali],
    tokenByAlbumId,
    (token) => `https://momentsforever.vercel.app/n/${token}`,
  );

  const dubaiTrip = trips.find((t) => t.title === "Dubai")!;
  const baliTrip = trips.find((t) => t.title === "Bali")!;
  assert.equal(dubaiTrip.nfcUrl, "https://momentsforever.vercel.app/n/tok-dubai");
  assert.equal(baliTrip.nfcUrl, "https://momentsforever.vercel.app/n/tok-bali");
});

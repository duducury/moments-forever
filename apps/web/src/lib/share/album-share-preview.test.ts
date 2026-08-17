import assert from "node:assert/strict";
import test from "node:test";

import type { Metadata } from "next";

import {
  albumCoverPublicPath,
  buildAlbumShareMetadata,
  pickAlbumShareCoverPhotoId,
  type AlbumShareCoverCandidate,
} from "./album-share-preview";

function twitterCard(metadata: Metadata): string | undefined {
  const twitter = metadata.twitter;
  if (!twitter || typeof twitter !== "object" || !("card" in twitter)) {
    return undefined;
  }
  return typeof twitter.card === "string" ? twitter.card : undefined;
}

function photo(
  id: string,
  positionInAlbum: number,
  hasFile = true,
): AlbumShareCoverCandidate {
  return {
    id,
    hasFile,
    positionInAlbum,
    positionInMoment: positionInAlbum,
  };
}

test("pickAlbumShareCoverPhotoId prefers the chosen cover when it is in R2", () => {
  const photos = [photo("a", 1), photo("b", 2), photo("c", 3)];
  assert.equal(pickAlbumShareCoverPhotoId("b", photos), "b");
});

test("pickAlbumShareCoverPhotoId skips a cover that is not uploaded yet", () => {
  const photos = [photo("a", 1), photo("b", 2, false), photo("c", 3)];
  assert.equal(pickAlbumShareCoverPhotoId("b", photos), "a");
});

test("pickAlbumShareCoverPhotoId falls back to the first stored photo", () => {
  const photos = [photo("a", 2), photo("b", 1, false), photo("c", 3)];
  assert.equal(pickAlbumShareCoverPhotoId(null, photos), "a");
});

test("pickAlbumShareCoverPhotoId returns null when nothing is stored", () => {
  const photos = [photo("a", 1, false), photo("b", 2, false)];
  assert.equal(pickAlbumShareCoverPhotoId("a", photos), null);
});

test("albumCoverPublicPath versions the URL with the cover photo id", () => {
  const albumId = "11111111-1111-4111-8111-111111111111";
  const photoId = "22222222-2222-4222-8222-222222222222";
  assert.equal(
    albumCoverPublicPath(albumId, photoId),
    `/api/albums/${albumId}/cover?v=${photoId}`,
  );
});

test("buildAlbumShareMetadata uses the album cover for Open Graph", () => {
  const albumId = "11111111-1111-4111-8111-111111111111";
  const photoId = "22222222-2222-4222-8222-222222222222";
  const metadata = buildAlbumShareMetadata({
    tripSlug: "japao-2026",
    albumId,
    title: "Quioto",
    description: "Quioto · Japão 2026 no Moments Forever.",
    coverPhotoId: photoId,
    coverWidth: 1600,
    coverHeight: 900,
  });

  assert.equal(metadata.title, "Quioto");
  assert.equal(twitterCard(metadata), "summary_large_image");
  const images = metadata.openGraph?.images;
  assert.ok(Array.isArray(images));
  const image = images[0];
  assert.ok(image && typeof image === "object" && "url" in image);
  assert.match(String(image.url), /\/api\/albums\/.+\/cover\?v=/);
  assert.match(String(image.url), new RegExp(photoId, "u"));
});

test("buildAlbumShareMetadata falls back to the brand icon without a cover", () => {
  const metadata = buildAlbumShareMetadata({
    tripSlug: "japao-2026",
    albumId: "11111111-1111-4111-8111-111111111111",
    title: "Quioto",
    description: "Quioto · Japão 2026 no Moments Forever.",
    coverPhotoId: null,
    coverWidth: null,
    coverHeight: null,
  });

  assert.equal(twitterCard(metadata), "summary");
  const images = metadata.openGraph?.images;
  assert.ok(Array.isArray(images));
  const image = images[0];
  assert.ok(image && typeof image === "object" && "url" in image);
  assert.match(String(image.url), /\/brand\/icon-512\.png/);
});

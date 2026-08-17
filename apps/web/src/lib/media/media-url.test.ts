import assert from "node:assert/strict";
import test from "node:test";

import {
  isPersistedPhotoId,
  mediaCacheControl,
  mediaProxyUrl,
  resolvePhotoSrc,
} from "./media-url";

test("isPersistedPhotoId accepts photo UUIDs only", () => {
  assert.equal(
    isPersistedPhotoId("3b1c2d4e-5f60-4789-a012-3456789abcde"),
    true,
  );
  assert.equal(
    isPersistedPhotoId("profile-avatar:3b1c2d4e-5f60-4789-a012-3456789abcde"),
    false,
  );
  assert.equal(isPersistedPhotoId("not-a-uuid"), false);
});

test("mediaProxyUrl is stable and same-origin", () => {
  const id = "3b1c2d4e-5f60-4789-a012-3456789abcde";
  assert.equal(
    mediaProxyUrl(id, "thumbnail"),
    `/api/media/${id}?variant=thumbnail`,
  );
  assert.equal(mediaProxyUrl(id, "full"), `/api/media/${id}?variant=full`);
});

test("resolvePhotoSrc prefers cache then proxy, never remote for avatars", () => {
  const id = "3b1c2d4e-5f60-4789-a012-3456789abcde";
  assert.equal(resolvePhotoSrc(null, "thumbnail", null), null);
  assert.equal(resolvePhotoSrc(id, "thumbnail", "blob:abc"), "blob:abc");
  assert.equal(
    resolvePhotoSrc(id, "thumbnail", null),
    `/api/media/${id}?variant=thumbnail`,
  );
  assert.equal(
    resolvePhotoSrc(`profile-avatar:${id}`, "full", null),
    null,
  );
});

test("mediaCacheControl is public only when the photo is publicly readable", () => {
  assert.match(mediaCacheControl(true), /public/);
  assert.match(mediaCacheControl(true), /s-maxage=/);
  assert.match(mediaCacheControl(false), /private/);
  assert.doesNotMatch(mediaCacheControl(false), /public/);
});

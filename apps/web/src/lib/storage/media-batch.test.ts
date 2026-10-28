import assert from "node:assert/strict";
import test from "node:test";

import { MAX_BATCH_PHOTOS, parseConfirmItems, parseUploadUrlItems, planConfirm } from "./media-batch";

const USER = "user-1";
const EXP = "exp-1";
const key = (photo: string, variant: "original" | "thumbnail") => `photos/${USER}/${EXP}/${photo}/${variant}`;

test("upload URL requests: valid lists pass, malformed or oversized ones are refused", () => {
  assert.deepEqual(parseUploadUrlItems([{ photoId: " a ", variant: "original", contentType: "image/jpeg" }]), [
    { photoId: "a", variant: "original", contentType: "image/jpeg" },
  ]);
  assert.equal(parseUploadUrlItems([]), null);
  assert.equal(parseUploadUrlItems("x"), null);
  assert.equal(parseUploadUrlItems([{ photoId: "a", variant: "full" }]), null);
  assert.equal(parseUploadUrlItems([{ photoId: "", variant: "original" }]), null);
  assert.equal(
    parseUploadUrlItems(Array.from({ length: MAX_BATCH_PHOTOS * 2 + 1 }, (_, i) => ({ photoId: `p${i}`, variant: "original" }))),
    null,
  );
  assert.equal(parseUploadUrlItems([{ photoId: "a", variant: "thumbnail" }])?.[0]?.contentType, "application/octet-stream");
});

test("confirmations: duplicates and oversized lists are refused", () => {
  assert.equal(parseConfirmItems([{ photoId: "a" }, { photoId: "a" }]), null);
  assert.equal(parseConfirmItems([]), null);
  assert.equal(parseConfirmItems(Array.from({ length: MAX_BATCH_PHOTOS + 1 }, (_, i) => ({ photoId: `p${i}`, storageKey: key(`p${i}`, "original") }))), null);
  assert.equal(parseConfirmItems([{ photoId: "a", storageKey: key("a", "original") }])?.length, 1);
});

test("a confirmation may only write the keys this user, experience and photo would get", () => {
  const ok = planConfirm({
    userId: USER,
    experienceId: EXP,
    item: { photoId: "p1", storageKey: key("p1", "original"), thumbnailStorageKey: key("p1", "thumbnail") },
  });
  assert.deepEqual(ok, {
    ok: true,
    headKeys: [key("p1", "original"), key("p1", "thumbnail")],
    patch: { storage_key: key("p1", "original"), thumbnail_storage_key: key("p1", "thumbnail") },
  });

  const othersPhoto = planConfirm({ userId: USER, experienceId: EXP, item: { photoId: "p1", storageKey: key("p2", "original"), thumbnailStorageKey: undefined } });
  assert.deepEqual(othersPhoto, { ok: false, error: "storageKey inválida." });
  const otherUser = planConfirm({ userId: USER, experienceId: EXP, item: { photoId: "p1", storageKey: `photos/user-2/${EXP}/p1/original`, thumbnailStorageKey: undefined } });
  assert.equal(otherUser.ok, false);
  const swapped = planConfirm({ userId: USER, experienceId: EXP, item: { photoId: "p1", storageKey: undefined, thumbnailStorageKey: key("p1", "original") } });
  assert.deepEqual(swapped, { ok: false, error: "thumbnailStorageKey inválida." });
  const nothing = planConfirm({ userId: USER, experienceId: EXP, item: { photoId: "p1", storageKey: undefined, thumbnailStorageKey: undefined } });
  assert.deepEqual(nothing, { ok: false, error: "Nada para confirmar." });
  const onlyOriginal = planConfirm({ userId: USER, experienceId: EXP, item: { photoId: "p1", storageKey: key("p1", "original"), thumbnailStorageKey: null } });
  assert.deepEqual(onlyOriginal, { ok: true, headKeys: [key("p1", "original")], patch: { storage_key: key("p1", "original"), thumbnail_storage_key: null } });
});

import assert from "node:assert/strict";
import test from "node:test";

import { lightboxNeighborIds } from "./lightbox-neighbors";

test("first photo has no previous neighbor (does not wrap to last)", () => {
  assert.deepEqual(lightboxNeighborIds(["a", "b", "c"], 0), [
    null,
    null,
    "b",
    "c",
  ]);
});

test("two-photo album: opening the first does not preload the second as previous", () => {
  assert.deepEqual(lightboxNeighborIds(["a", "b"], 0), [
    null,
    null,
    "b",
    null,
  ]);
});

test("last photo has no next neighbor", () => {
  assert.deepEqual(lightboxNeighborIds(["a", "b", "c"], 2), [
    "a",
    "b",
    null,
    null,
  ]);
});

test("middle photo has both sides", () => {
  assert.deepEqual(lightboxNeighborIds(["a", "b", "c", "d"], 1), [
    null,
    "a",
    "c",
    "d",
  ]);
});

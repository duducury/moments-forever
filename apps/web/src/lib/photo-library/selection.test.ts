import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAll,
  emptySelection,
  reviewSelection,
  selectAll,
  pickPreview,
  selectedAssets,
  selectedCount,
  toggleAsset,
  type Candidate,
} from "./selection";
import { PARIS, photosBetween } from "./test-helpers";

function candidate(key: string, count: number, title = "Paris", kind: "new" | "existing" = "new"): Candidate {
  return {
    key,
    kind,
    title,
    name: title,
    titleState: "named",
    locationNote: null,
    target: null,
    assets: photosBetween("2026-06-10", "2026-06-20", PARIS, 1).slice(0, count),
    period: null,
    countryCode: null,
    withoutLocationCount: 0,
  };
}

test("nothing is selected by default: no photo, no trip", () => {
  const review = reviewSelection([candidate("paris", 8)], emptySelection());
  assert.equal(review.photoCount, 0);
  assert.equal(review.tripCount, 0);
  assert.equal(review.blocker, "Selecione pelo menos uma foto.");
});

test("select all, unselect all and single toggles update the counts per trip", () => {
  const paris = candidate("paris", 8);
  const rome = candidate("rome", 5, "Roma");
  let selection = selectAll(emptySelection(), paris);
  selection = toggleAsset(selection, "rome", rome.assets[0]!.nativeId);
  selection = toggleAsset(selection, "rome", rome.assets[1]!.nativeId);
  selection = toggleAsset(selection, "rome", rome.assets[1]!.nativeId); // untick again

  const review = reviewSelection([paris, rome], selection);
  assert.deepEqual(
    review.rows.map((row) => [row.key, row.found, row.selected]),
    [["paris", 8, 8], ["rome", 5, 1]],
  );
  assert.equal(review.tripCount, 2);
  assert.equal(review.photoCount, 9);
  assert.equal(review.blocker, null);
  assert.equal(selectedCount(paris, selection), 8);

  assert.equal(reviewSelection([paris], clearAll(selection, "paris")).photoCount, 0);
});

test("a trip with nothing ticked is simply not part of the import; the others still go", () => {
  const paris = candidate("paris", 8);
  const rome = candidate("rome", 5, "Roma");
  const review = reviewSelection([paris, rome], selectAll(emptySelection(), paris));
  assert.equal(review.tripCount, 1);
  assert.deepEqual(review.rows.map((row) => row.key), ["paris"]);
});

test("a new trip needs a name before confirming; an existing one does not", () => {
  const unnamed = { ...candidate("paris", 8), name: "   " };
  assert.equal(
    reviewSelection([unnamed], selectAll(emptySelection(), unnamed)).blocker,
    "Dê um nome a cada viagem nova.",
  );

  const existing = candidate("album", 3, "Paris", "existing");
  assert.equal(reviewSelection([existing], selectAll(emptySelection(), existing)).blocker, null);
});

test("ticks that are no longer on offer (e.g. after a rescan) are not counted", () => {
  const paris = candidate("paris", 4);
  const stale = new Map([["paris", new Set(["gone", paris.assets[0]!.nativeId])]]);
  assert.equal(reviewSelection([paris], stale).photoCount, 1);
});

test("the preview strip spreads over the whole trip instead of showing the first photos", () => {
  const items = Array.from({ length: 96 }, (_, index) => index);
  assert.deepEqual(pickPreview(items, 5), [0, 19, 38, 57, 76]);
  assert.deepEqual(pickPreview([1, 2, 3], 5), [1, 2, 3]);
  assert.deepEqual(pickPreview([], 5), []);
});

test("only ticked photos are exported, in the order they were found", () => {
  const paris = candidate("paris", 6);
  const selection = toggleAsset(toggleAsset(emptySelection(), "paris", paris.assets[4]!.nativeId), "paris", paris.assets[1]!.nativeId);
  assert.deepEqual(
    selectedAssets(paris, selection).map((asset) => asset.nativeId),
    [paris.assets[1]!.nativeId, paris.assets[4]!.nativeId],
  );
});

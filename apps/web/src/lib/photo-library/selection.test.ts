import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAll,
  emptySelection,
  reviewSelection,
  selectAll,
  selectedAssets,
  toggleAsset,
  type Candidate,
} from "./selection";
import { PARIS, photosBetween } from "./test-helpers";

function candidate(key: string, count: number, title = "França, Paris", kind: "new" | "existing" = "new"): Candidate {
  return {
    key,
    kind,
    title,
    target: null,
    assets: photosBetween("2026-06-10", "2026-06-20", PARIS, 1).slice(0, count),
    period: null,
    countryCode: null,
    hint: null,
    withoutLocationCount: 0,
  };
}

test("nothing is selected by default: no photo, no trip", () => {
  const paris = candidate("paris", 8);
  const review = reviewSelection([paris], emptySelection(), new Set(["paris"]));
  assert.equal(review.photoCount, 0);
  assert.equal(review.tripCount, 0);
  assert.equal(review.blocker, "Selecione pelo menos uma foto.");
});

test("no trip chosen blocks the import", () => {
  const review = reviewSelection([candidate("paris", 8)], emptySelection(), new Set());
  assert.equal(review.blocker, "Escolha pelo menos uma viagem.");
  assert.equal(review.importable.length, 0);
});

test("select all, unselect all, and single toggles update the counts per trip", () => {
  const paris = candidate("paris", 8);
  const rome = candidate("rome", 5, "Itália, Roma");
  let selection = selectAll(emptySelection(), paris);
  selection = toggleAsset(selection, "rome", rome.assets[0]!.nativeId);
  selection = toggleAsset(selection, "rome", rome.assets[1]!.nativeId);
  selection = toggleAsset(selection, "rome", rome.assets[1]!.nativeId); // untick again

  const review = reviewSelection([paris, rome], selection, new Set(["paris", "rome"]));
  assert.deepEqual(
    review.rows.map((row) => [row.key, row.found, row.selected]),
    [["paris", 8, 8], ["rome", 5, 1]],
  );
  assert.equal(review.tripCount, 2);
  assert.equal(review.photoCount, 9);
  assert.equal(review.blocker, null);

  assert.equal(reviewSelection([paris], clearAll(selection, "paris"), new Set(["paris"])).photoCount, 0);
});

test("a chosen trip with nothing ticked is left out of the import, others still go", () => {
  const paris = candidate("paris", 8);
  const rome = candidate("rome", 5, "Itália, Roma");
  const selection = selectAll(emptySelection(), paris);
  const review = reviewSelection([paris, rome], selection, new Set(["paris", "rome"]));
  assert.equal(review.tripCount, 1);
  assert.deepEqual(review.importable.map((row) => row.key), ["paris"]);
});

test("trips that were not chosen are ignored even if photos are ticked", () => {
  const paris = candidate("paris", 8);
  const review = reviewSelection([paris], selectAll(emptySelection(), paris), new Set());
  assert.equal(review.photoCount, 0);
});

test("a new trip needs a name before confirming; an existing one does not", () => {
  const unnamed = candidate("paris", 8, "   ");
  const selection = selectAll(emptySelection(), unnamed);
  assert.equal(reviewSelection([unnamed], selection, new Set(["paris"])).blocker, "Dê um nome a cada viagem nova.");

  const existing = candidate("album", 3, "", "existing");
  assert.equal(
    reviewSelection([existing], selectAll(emptySelection(), existing), new Set(["album"])).blocker,
    null,
  );
});

test("only ticked photos are exported, in the order they were found", () => {
  const paris = candidate("paris", 6);
  const selection = toggleAsset(toggleAsset(emptySelection(), "paris", paris.assets[4]!.nativeId), "paris", paris.assets[1]!.nativeId);
  assert.deepEqual(
    selectedAssets(paris, selection).map((asset) => asset.nativeId),
    [paris.assets[1]!.nativeId, paris.assets[4]!.nativeId],
  );
});

test("ticks that are no longer on offer (e.g. after a rescan) are not counted", () => {
  const paris = candidate("paris", 4);
  const stale = new Map([["paris", new Set(["gone", paris.assets[0]!.nativeId])]]);
  assert.equal(reviewSelection([paris], stale, new Set(["paris"])).photoCount, 1);
});

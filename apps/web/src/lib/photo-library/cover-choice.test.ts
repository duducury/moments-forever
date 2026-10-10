import assert from "node:assert/strict";
import test from "node:test";

import { coverChoices, effectiveCover, findCoverFile, TRIP_STORY_MAX_LENGTH } from "./cover-choice";
import type { LibraryAsset } from "./types";

const asset = (id: string): LibraryAsset => ({
  platform: "ios", nativeId: id, takenAt: null, latitude: null, longitude: null, width: 100, height: 100,
});
const many = Array.from({ length: 100 }, (_, i) => asset(`p${i}`));

test("the cover is the chosen photo while it is still selected, otherwise the first one", () => {
  assert.equal(effectiveCover(many, "p42")?.nativeId, "p42");
  assert.equal(effectiveCover(many, "gone")?.nativeId, "p0", "a photo that was unticked cannot stay the cover");
  assert.equal(effectiveCover(many, undefined)?.nativeId, "p0");
  assert.equal(effectiveCover([], "p1"), null);
});

test("cover choices are spread over the whole trip and always include the current cover", () => {
  const choices = coverChoices(many, 10, many[0]!);
  assert.equal(choices.length, 10);
  assert.ok(choices.some((c) => Number(c.nativeId.slice(1)) >= 80), "reaches the end of the trip");
  const withOdd = coverChoices(many, 10, many[43]!);
  assert.equal(withOdd.length, 10);
  assert.equal(withOdd[0]!.nativeId, "p43", "the current cover is never missing from the choices");
  assert.equal(coverChoices([many[0]!, many[1]!], 10, null).length, 2, "few photos: all of them");
});

test("the cover File is found through the library id it was exported from", () => {
  const files = [new File(["a"], "a.jpg"), new File(["b"], "b.jpg"), new File(["c"], "c.jpg")];
  const origins = new Map(files.map((file, i) => [file, { sourceAssetId: `ios:p${i}` }]));
  assert.equal(findCoverFile(files, origins, asset("p1")), files[1]);
  assert.equal(findCoverFile(files, origins, asset("p9")), null, "a photo that failed to export has no file");
  assert.equal(findCoverFile(files, origins, null), null);
});

test("the story limit matches the rest of the app", () => {
  assert.equal(TRIP_STORY_MAX_LENGTH, 4000);
});

import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.resolve(__dirname, "../../..", file), "utf8");

test("confirmation: name, story and cover are edited on the review screen and reach the trip creation", () => {
  const flow = read("src/components/find-trips/find-trips-flow.tsx");
  assert.match(flow, /<ReviewTripCard/);
  assert.match(flow, /story: stories\[row\.key\]/, "the story is saved with the new trip");
  assert.match(flow, /coverFile: findCoverFile\(exported\.files, exported\.origins, effectiveCover\(assets, covers\[row\.key\]\)\)/);
  assert.match(flow, /name: row\.name/, "the (renamed) name still creates the trip");
  assert.match(flow, /Cancelar[\s\S]*Voltar[\s\S]*Adicionar viagens/, "cancel / back / confirm are kept");
  const card = read("src/components/find-trips/review-trip-card.tsx");
  for (const text of ["Nome da viagem", "Sobre essa viagem", "Trocar capa", "O que essa viagem significou para você?"]) assert.ok(card.includes(text), text);
  const creation = read("src/lib/photos/create-named-trip-from-files.ts");
  assert.match(creation, /readonly coverFile\?: File \| null;/, "the existing creation already takes the cover…");
  assert.match(creation, /readonly story\?: string;/, "…and the story: no new backend");
});

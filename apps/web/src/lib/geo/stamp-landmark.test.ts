import assert from "node:assert/strict";
import test from "node:test";

import { stampLabels, stampLandmark, stampShapeKey } from "./stamp-landmark";

test("known cities get their landmark, accent- and case-insensitive", () => {
  assert.equal(stampLandmark(["Dubai"]), "burj-khalifa");
  assert.equal(stampLandmark(["PARIS"]), "eiffel-tower");
  assert.equal(stampLandmark(["Londres"]), "big-ben");
  assert.equal(stampLandmark([null, "London"]), "big-ben");
});

test("a known city as the first word of a short place name still matches", () => {
  assert.equal(stampLandmark(["Dubai Marina"]), "burj-khalifa");
});

test("unknown or ambiguous destinations never get a landmark", () => {
  assert.equal(stampLandmark(["Texas"]), null);
  assert.equal(stampLandmark(["Emirados Árabes Unidos"]), null);
  assert.equal(stampLandmark(["Paris, Texas Road Trip Across The State"]), null);
  assert.equal(stampLandmark([undefined, ""]), null);
});

test("stamp labels: city first, place as fallback, country second line", () => {
  assert.deepEqual(
    stampLabels({ city: "Dubai", place: "Deira", country: "Emirados Árabes Unidos" }),
    { name: "DUBAI", country: "EMIRADOS ÁRABES UNIDOS" },
  );
  assert.deepEqual(stampLabels({ city: null, place: "Deira", country: null }), {
    name: "DEIRA",
    country: "",
  });
  assert.equal(stampLabels({ city: "Brasil", place: "x", country: "Brasil" }).country, "");
  assert.ok(stampLabels({ city: "Santo Antônio do Pinhal de Cima", place: "x", country: "" }).name.endsWith("…"));
});

test("shape key: US state when known, otherwise the country, never a guess", () => {
  assert.deepEqual(stampShapeKey("US", "tx"), { kind: "us-state", key: "TX" });
  assert.deepEqual(stampShapeKey("us", null), { kind: "country", key: "US" });
  assert.deepEqual(stampShapeKey("br", "TX"), { kind: "country", key: "BR" });
  assert.equal(stampShapeKey(null, null), null);
  assert.equal(stampShapeKey("Brasil", null), null);
});

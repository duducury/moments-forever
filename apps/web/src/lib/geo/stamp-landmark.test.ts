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

test("a place title like 'Emirados Árabes Unidos, Deira' matches through its comma parts and district", () => {
  assert.equal(
    stampLandmark(["Emirados Árabes Unidos, Deira"], { countryCode: "AE" }),
    "burj-khalifa",
  );
  assert.equal(stampLandmark(["Paris, França"]), "eiffel-tower");
});

test("districts only count in the right country", () => {
  assert.equal(stampLandmark(["Soho"], { countryCode: "GB" }), "big-ben");
  assert.equal(stampLandmark(["Soho"], { countryCode: "US" }), null);
  assert.equal(stampLandmark(["Soho"]), null);
  assert.equal(stampLandmark(["Deira"], { countryCode: "BR" }), null);
});

test("photo GPS inside a known city decides on its own", () => {
  assert.equal(
    stampLandmark(["Algum bairro"], { coordinates: { latitude: 25.2697, longitude: 55.3095 } }),
    "burj-khalifa",
  );
  assert.equal(
    stampLandmark([], { coordinates: { latitude: 48.8584, longitude: 2.2945 } }),
    "eiffel-tower",
  );
  // Sharjah and Abu Dhabi are not Dubai.
  assert.equal(stampLandmark([], { coordinates: { latitude: 25.3463, longitude: 55.4209 } }), null);
  assert.equal(stampLandmark([], { coordinates: { latitude: 24.4539, longitude: 54.3773 } }), null);
});

test("unknown or ambiguous destinations never get a landmark", () => {
  assert.equal(stampLandmark(["Texas"]), null);
  assert.equal(stampLandmark(["Emirados Árabes Unidos"]), null);
  assert.equal(stampLandmark(["Paris, Texas"], { countryCode: "US" }), null);
  assert.equal(stampLandmark(["Paris, Texas Road Trip Across The State"], { countryCode: "US" }), null);
  assert.equal(stampLandmark(["Dubai"], { countryCode: "BR" }), null);
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

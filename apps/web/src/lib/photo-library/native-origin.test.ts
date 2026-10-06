import assert from "node:assert/strict";
import test from "node:test";

import { mapLocalDateSourceToDb } from "@moments-forever/shared";
import type { LocalPhotoMetadata } from "@moments-forever/types";

import { applyNativeOrigin } from "./native-origin";

const base: LocalPhotoMetadata = {
  id: "p1",
  name: "IMG.jpg",
  size: 1000,
  type: "image/jpeg",
  lastModified: 1_700_000_000_000,
  date: null,
  dateSource: "unknown",
  gps: null,
  dimensions: null,
  exif: { availableFields: [], cameraMake: null, cameraModel: null, orientation: null },
  fingerprint: "x",
  duplicateOf: null,
  warnings: [],
  analysisMs: 0,
};

test("without an origin the metadata is untouched", () => {
  assert.equal(applyNativeOrigin(base, undefined), base);
});

test("the library's date and GPS replace what the file lacked, and map to exif_original", () => {
  const result = applyNativeOrigin(base, {
    sourceAssetId: "ios:ABC",
    takenAt: "2026-06-10T14:30:00.000Z",
    latitude: 48.85,
    longitude: 2.35,
  });
  assert.deepEqual(result.gps, { latitude: 48.85, longitude: 2.35 });
  assert.deepEqual(
    mapLocalDateSourceToDb(result.dateSource, result.date, result.exif.availableFields),
    { dateSource: "exif_original", capturedAt: "2026-06-10T14:30:00.000Z" },
  );
});

test("a photo without a library date keeps the file's own, and one without GPS keeps no GPS", () => {
  const result = applyNativeOrigin(base, {
    sourceAssetId: "ios:ABC",
    takenAt: null,
    latitude: null,
    longitude: null,
  });
  assert.equal(result.date, null);
  assert.equal(result.gps, null);
  assert.deepEqual(
    mapLocalDateSourceToDb(result.dateSource, result.date, result.exif.availableFields),
    { dateSource: "absent", capturedAt: null },
  );
});

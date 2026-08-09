import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseBrowserExifFields } from "./browser-metadata";

test("reads derived GPS from an anonymized JPEG GPS IFD fixture", async () => {
  const encoded = await readFile(
    new URL("./__fixtures__/anonymous-gps.jpg.base64", import.meta.url),
    "utf8",
  );
  const fixture = new Uint8Array(
    Buffer.from(encoded.trim(), "base64"),
  );

  const fields = await parseBrowserExifFields(fixture);

  assert.equal(fields.latitude, 10.5);
  assert.equal(fields.longitude, 20.25);
  assert.deepEqual(fields.GPSLatitude, [10, 30, 0]);
  assert.equal(fields.GPSLatitudeRef, "N");
  assert.deepEqual(fields.GPSLongitude, [20, 15, 0]);
  assert.equal(fields.GPSLongitudeRef, "E");
});

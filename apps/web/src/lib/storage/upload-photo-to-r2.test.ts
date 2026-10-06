import assert from "node:assert/strict";
import test from "node:test";

import { storageUnreachableMessage } from "./upload-photo-to-r2";

test("the failure message names the app origin the R2 CORS rule has to allow", () => {
  const message = storageUnreachableMessage("https://moments-forever-abc-x.vercel.app");
  assert.match(message, /CORS do R2/);
  assert.match(message, /https:\/\/moments-forever-abc-x\.vercel\.app/);
  assert.match(message, /PUT/);
});

test("without a window (server) the message still reads well", () => {
  const message = storageUnreachableMessage(null);
  assert.doesNotMatch(message, /Origem deste app/);
  assert.match(message, /CORS do R2/);
});

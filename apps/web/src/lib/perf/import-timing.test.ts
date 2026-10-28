import assert from "node:assert/strict";
import test from "node:test";

import { startImportTimer } from "./import-timing";

test("each stage is measured from the previous mark, and the total from the start", () => {
  let clock = 1000;
  const timer = startImportTimer("new-trip", () => clock);
  clock += 120;
  timer.mark("prepare");
  clock += 30;
  timer.mark("save-local");
  clock += 500;
  timer.mark("upload");
  clock += 5;
  const run = timer.finish({ photos: 4, failed: 0 });
  assert.deepEqual(run.stages, [
    { stage: "prepare", ms: 120 },
    { stage: "save-local", ms: 30 },
    { stage: "upload", ms: 500 },
  ]);
  assert.equal(run.totalMs, 655);
  assert.equal(run.photos, 4);
});

test("finishing outside a browser never throws", () => {
  const timer = startImportTimer("x", () => 0);
  assert.doesNotThrow(() => timer.finish());
});

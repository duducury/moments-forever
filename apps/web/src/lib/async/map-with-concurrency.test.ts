import assert from "node:assert/strict";
import test from "node:test";

import { mapWithConcurrency } from "./map-with-concurrency";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("keeps results in input order regardless of finish order", async () => {
  const out = await mapWithConcurrency([30, 5, 15, 1], 3, async (ms, i) => {
    await sleep(ms);
    return `${i}:${ms}`;
  });
  assert.deepEqual(out, ["0:30", "1:5", "2:15", "3:1"]);
});

test("never runs more than `limit` at once, and does use the parallelism", async () => {
  let running = 0;
  let peak = 0;
  await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
    running++;
    peak = Math.max(peak, running);
    await sleep(5);
    running--;
  });
  assert.equal(peak, 3);
});

test("limit larger than the list, and an empty list, are fine", async () => {
  assert.deepEqual(await mapWithConcurrency([1, 2], 10, async (n) => n * 2), [2, 4]);
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
});

test("the first error is thrown and no new work starts after it", async () => {
  const started: number[] = [];
  await assert.rejects(
    mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      await sleep(2);
      if (n === 1) throw new Error("boom");
      return n;
    }),
    /boom/,
  );
  assert.ok(started.length < 6, "stops scheduling after a failure");
});

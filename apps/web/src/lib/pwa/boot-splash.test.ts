import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOT_SPLASH_SKIP_WINDOW_MS,
  BOOT_SPLASH_STORAGE_KEY,
  bootSplashSkipScript,
  shouldSkipBootSplash,
} from "./boot-splash";

test("shouldSkipBootSplash: no stamp means this is the first document", () => {
  assert.equal(shouldSkipBootSplash(null, 1_000), false);
  assert.equal(shouldSkipBootSplash("", 1_000), false);
  assert.equal(shouldSkipBootSplash(undefined, 1_000), false);
});

test("shouldSkipBootSplash: skips only inside the window", () => {
  const stamp = "10000";
  assert.equal(shouldSkipBootSplash(stamp, 10_000), true);
  assert.equal(shouldSkipBootSplash(stamp, 10_000 + BOOT_SPLASH_SKIP_WINDOW_MS - 1), true);
  assert.equal(shouldSkipBootSplash(stamp, 10_000 + BOOT_SPLASH_SKIP_WINDOW_MS), false);
});

test("shouldSkipBootSplash: ignores garbage and future stamps", () => {
  assert.equal(shouldSkipBootSplash("not-a-number", 1_000), false);
  assert.equal(shouldSkipBootSplash("999999", 1_000), false);
});

/** Runs the real inline script against a fake browser environment. */
function runInlineScript(initialStamp: string | null, now: number) {
  const store = new Map<string, string>();
  if (initialStamp !== null) store.set(BOOT_SPLASH_STORAGE_KEY, initialStamp);
  const dataset: Record<string, string> = {};
  const FakeDate = { now: () => now };
  new Function("sessionStorage", "document", "Date", bootSplashSkipScript())(
    {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
    { documentElement: { dataset } },
    FakeDate,
  );
  return { stamp: store.get(BOOT_SPLASH_STORAGE_KEY), dataset };
}

test("inline script: first document stamps the visit and keeps the splash", () => {
  const { stamp, dataset } = runInlineScript(null, 5_000);
  assert.equal(stamp, "5000");
  assert.equal(dataset.bootSplash, undefined);
});

test("inline script: a second document inside the window skips the splash", () => {
  const { stamp, dataset } = runInlineScript("5000", 5_000 + 1_900);
  assert.equal(dataset.bootSplash, "skip");
  assert.equal(stamp, "5000", "must not extend the window");
});

test("inline script: after the window it behaves like a fresh visit", () => {
  const later = 5_000 + BOOT_SPLASH_SKIP_WINDOW_MS + 1;
  const { stamp, dataset } = runInlineScript("5000", later);
  assert.equal(dataset.bootSplash, undefined);
  assert.equal(stamp, String(later));
});

test("inline script agrees with shouldSkipBootSplash across the boundary", () => {
  for (const delta of [0, 1, 19_999, 20_000, 20_001, 60_000]) {
    const { dataset } = runInlineScript("5000", 5_000 + delta);
    assert.equal(
      dataset.bootSplash === "skip",
      shouldSkipBootSplash("5000", 5_000 + delta),
      `delta ${delta}`,
    );
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { validateBlockInput } from "./user-blocks";

test("accepts blocking a different user", () => {
  const result = validateBlockInput("user-b", "user-a");
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.blockedId : undefined, "user-b");
});

test("trims the blocked id", () => {
  const result = validateBlockInput("  user-b  ", "user-a");
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.blockedId : undefined, "user-b");
});

test("rejects a missing blocked id", () => {
  const result = validateBlockInput(undefined, "user-a");
  assert.equal(result.ok, false);
});

test("rejects blocking yourself", () => {
  const result = validateBlockInput("user-a", "user-a");
  assert.equal(result.ok, false);
});

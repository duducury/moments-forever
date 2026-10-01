import assert from "node:assert/strict";
import test from "node:test";

import { validateContentReportInput } from "./content-reports";

test("accepts a valid report and trims/normalizes fields", () => {
  const result = validateContentReportInput({
    targetType: " album ",
    targetId: " abc-123 ",
    reason: " spam ",
    details: "  looks like spam  ",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ok
      ? result.value
      : null,
    {
      targetType: "album",
      targetId: "abc-123",
      reason: "spam",
      details: "looks like spam",
    },
  );
});

test("defaults details to null when omitted or blank", () => {
  const result = validateContentReportInput({
    targetType: "user",
    targetId: "u1",
    reason: "other",
    details: "   ",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.value.details : undefined, null);
});

test("rejects an unknown target type", () => {
  const result = validateContentReportInput({
    targetType: "comment",
    targetId: "x",
    reason: "spam",
  });
  assert.equal(result.ok, false);
});

test("rejects a missing target id", () => {
  const result = validateContentReportInput({
    targetType: "photo",
    targetId: "  ",
    reason: "spam",
  });
  assert.equal(result.ok, false);
});

test("rejects an unknown reason", () => {
  const result = validateContentReportInput({
    targetType: "photo",
    targetId: "p1",
    reason: "because-i-feel-like-it",
  });
  assert.equal(result.ok, false);
});

test("accepts all five documented reasons", () => {
  for (const reason of ["offensive", "illegal", "spam", "inappropriate", "other"]) {
    const result = validateContentReportInput({
      targetType: "experience",
      targetId: "e1",
      reason,
    });
    assert.equal(result.ok, true, `expected reason "${reason}" to be valid`);
  }
});

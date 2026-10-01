import assert from "node:assert/strict";
import test from "node:test";

import {
  type ContentReportsTable,
  insertContentReport,
  validateContentReportInput,
} from "./content-reports";

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

const REPORT_INPUT = {
  targetType: "user",
  targetId: "target-1",
  reason: "spam",
  details: null,
} as const;

function fakeTable(
  respond: () => { data: { id: string } | null; error: { message: string } | null },
): ContentReportsTable {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve(respond()),
        }),
      }),
    }),
  };
}

test("insertContentReport: reports success only when Supabase returns a real row id", async () => {
  const supabase = fakeTable(() => ({ data: { id: "row-123" }, error: null }));
  const result = await insertContentReport(supabase, "reporter-1", REPORT_INPUT);
  assert.deepEqual(result, { ok: true, id: "row-123" });
});

test("insertContentReport: an RLS/Postgres error never reports success", async () => {
  const supabase = fakeTable(() => ({
    data: null,
    error: { message: "new row violates row-level security policy" },
  }));
  const result = await insertContentReport(supabase, "reporter-1", REPORT_INPUT);
  assert.equal(result.ok, false);
});

test("insertContentReport: no error but no row returned never reports success", async () => {
  // Defensive case: if Supabase ever comes back with neither an error nor a
  // usable row (e.g. a 0-row RETURNING under RLS), this must still fail
  // closed — a denúncia must never be confirmed to the user without an id.
  const supabase = fakeTable(() => ({ data: null, error: null }));
  const result = await insertContentReport(supabase, "reporter-1", REPORT_INPUT);
  assert.equal(result.ok, false);
});

test("insertContentReport: an empty-string id never reports success", async () => {
  const supabase = fakeTable(() => ({ data: { id: "" }, error: null }));
  const result = await insertContentReport(supabase, "reporter-1", REPORT_INPUT);
  assert.equal(result.ok, false);
});

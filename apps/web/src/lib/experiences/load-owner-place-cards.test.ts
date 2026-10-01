import assert from "node:assert/strict";
import test from "node:test";

import { loadOwnerPlaceCards } from "./load-owner-place-cards";

type Call = { readonly method: string; readonly args: readonly unknown[] };

/**
 * Minimal chainable Supabase query-builder fake. Stage 1 of
 * loadOwnerPlaceCards always resolves with an empty experiences list here,
 * so the function returns early — exactly enough to assert on which
 * .eq(...) filters it applied before resolving.
 */
function fakeSupabase(calls: Call[]) {
  function builder() {
    const self = {
      select(...args: unknown[]) {
        calls.push({ method: "select", args });
        return self;
      },
      eq(...args: unknown[]) {
        calls.push({ method: "eq", args });
        return self;
      },
      order(...args: unknown[]) {
        calls.push({ method: "order", args });
        return Promise.resolve({ data: [], error: null });
      },
    };
    return self;
  }
  return { from: () => builder() } as unknown as Parameters<
    typeof loadOwnerPlaceCards
  >[0];
}

test("publicOnly: true filters experiences to public + published", async () => {
  const calls: Call[] = [];
  const supabase = fakeSupabase(calls);
  await loadOwnerPlaceCards(supabase, "owner-1", { publicOnly: true });
  const eqCalls = calls
    .filter((call) => call.method === "eq")
    .map((call) => call.args);
  assert.deepEqual(eqCalls, [
    ["owner_id", "owner-1"],
    ["visibility", "public"],
    ["status", "published"],
  ]);
});

test("publicOnly omitted preserves current behavior (owner-only filter)", async () => {
  const calls: Call[] = [];
  const supabase = fakeSupabase(calls);
  await loadOwnerPlaceCards(supabase, "owner-1");
  const eqCalls = calls
    .filter((call) => call.method === "eq")
    .map((call) => call.args);
  assert.deepEqual(eqCalls, [["owner_id", "owner-1"]]);
});

test("publicOnly: false behaves the same as omitted", async () => {
  const calls: Call[] = [];
  const supabase = fakeSupabase(calls);
  await loadOwnerPlaceCards(supabase, "owner-1", { publicOnly: false });
  const eqCalls = calls
    .filter((call) => call.method === "eq")
    .map((call) => call.args);
  assert.deepEqual(eqCalls, [["owner_id", "owner-1"]]);
});

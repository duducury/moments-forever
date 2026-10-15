import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { persistOwnerPlaceCountryCodesAfterResponse } from "./persist-after-response";

function fakeClient(calls: string[]): SupabaseClient {
  const result = { data: null, error: { message: "column missing" } };
  const query = {
    select: () => query,
    eq: () => Promise.resolve(result),
  };
  return {
    from: (table: string) => {
      calls.push(table);
      return query;
    },
  } as unknown as SupabaseClient;
}

test("without a request scope the country-code work still runs, unawaited, and never throws or blocks", async () => {
  const calls: string[] = [];
  const started = Date.now();
  assert.doesNotThrow(() => persistOwnerPlaceCountryCodesAfterResponse(fakeClient(calls), "owner-1"));
  assert.ok(Date.now() - started < 50, "returns immediately");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, ["experiences"], "the first query was issued, in the background");
});

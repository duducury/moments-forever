import assert from "node:assert/strict";
import test from "node:test";

import { perfLogEnabled, placeCardsJoinMode } from "./flags";

test("perfLogEnabled accepts common truthy spellings, quotes and spaces", () => {
  for (const v of ["1", "true", "TRUE", " on ", '"1"', "'yes'"]) {
    assert.equal(perfLogEnabled({ PERF_LOG: v } as never), true, v);
  }
  for (const v of [undefined, "", "0", "off", "false", "nope"]) {
    assert.equal(perfLogEnabled({ PERF_LOG: v } as never), false, String(v));
  }
});

test("placeCardsJoinMode defaults to off and parses on/compare tolerantly", () => {
  assert.equal(placeCardsJoinMode({} as never), "off");
  assert.equal(placeCardsJoinMode({ PLACE_CARDS_JOIN: "1" } as never), "on");
  assert.equal(placeCardsJoinMode({ PLACE_CARDS_JOIN: " Compare " } as never), "compare");
  assert.equal(placeCardsJoinMode({ PLACE_CARDS_JOIN: '"compare"' } as never), "compare");
  assert.equal(placeCardsJoinMode({ PLACE_CARDS_JOIN: "garbage" } as never), "off");
});

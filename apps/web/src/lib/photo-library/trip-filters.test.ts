import assert from "node:assert/strict";
import test from "node:test";

import type { Candidate } from "./selection";
import { applyFilter, buildFilterChips, mainCountryOf } from "./trip-filters";

function candidate(key: string, kind: "new" | "existing", country: string | null, early: string | null = null): Candidate {
  return {
    key,
    kind,
    title: key,
    name: key,
    titleState: "named",
    locationNote: null,
    target: null,
    assets: [],
    period: null,
    countryCode: country,
    quickCountryCode: early,
    withoutLocationCount: 0,
  };
}

const list = [
  candidate("a", "new", "US"),
  candidate("b", "new", null, "US"), // city still loading, country known early
  candidate("c", "existing", "US"),
  candidate("d", "new", "ID"),
  candidate("e", "existing", "BR"),
];

test("chips: Todas, Novas, the main country, Outros — with their counts", () => {
  const chips = buildFilterChips(list);
  assert.deepEqual(
    chips.map((chip) => [chip.id, chip.label, chip.count]),
    [["all", "Todas", 5], ["new", "Novas", 3], ["country:US", "EUA", 3], ["other", "Outros", 2]],
  );
});

test("a trip whose city is still loading already counts for its country", () => {
  const chips = buildFilterChips(list);
  const main = mainCountryOf(chips);
  assert.equal(main, "US");
  assert.deepEqual(applyFilter(list, "country:US", main).map((c) => c.key), ["a", "b", "c"]);
  assert.deepEqual(applyFilter(list, "other", main).map((c) => c.key), ["d", "e"]);
  assert.deepEqual(applyFilter(list, "new", main).map((c) => c.key), ["a", "b", "d"]);
  assert.equal(applyFilter(list, "all", main).length, 5);
});

test("chips that would show everything are left out, and so is a useless row", () => {
  const same = [candidate("a", "new", "US"), candidate("b", "new", "US")];
  assert.deepEqual(buildFilterChips(same), []);
  assert.deepEqual(buildFilterChips([]).map((chip) => chip.id), ["all"]);
});

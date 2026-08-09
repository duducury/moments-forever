import assert from "node:assert/strict";
import test from "node:test";

import type { PhotoImportGroup } from "@moments-forever/types";

import {
  groupsForOrganizationMode,
  shortPlaceFolderName,
  suggestImportRootName,
} from "./import-organization.ts";

function group(
  id: string,
  label: string,
  photoIds: readonly string[],
): PhotoImportGroup {
  return {
    id,
    kind: "location",
    label,
    photoIds,
    roundedGps: { latitude: -8.5, longitude: 115.2 },
    date: null,
  };
}

test("shortPlaceFolderName prefers locality after country", () => {
  assert.equal(shortPlaceFolderName("Indonésia, Bali"), "Bali");
  assert.equal(shortPlaceFolderName("Ubud"), "Ubud");
});

test("suggestImportRootName uses shared country", () => {
  const name = suggestImportRootName(
    [
      group("a", "Indonésia, Bali", ["1"]),
      group("b", "Indonésia, Ubud", ["2"]),
    ],
    ["1", "2"],
  );
  assert.equal(name, "Indonésia");
});

test("groupsForOrganizationMode single collapses to one group", () => {
  const next = groupsForOrganizationMode(
    "single",
    [
      group("a", "Indonésia, Bali", ["1", "2"]),
      group("b", "Indonésia, Ubud", ["3"]),
    ],
    ["1", "2", "3"],
    "Indonésia",
  );
  assert.equal(next.length, 1);
  assert.equal(next[0]?.label, "Indonésia");
  assert.deepEqual(next[0]?.photoIds, ["1", "2", "3"]);
});

test("groupsForOrganizationMode nested keeps separate groups", () => {
  const groups = [
    group("a", "Indonésia, Bali", ["1"]),
    group("b", "Indonésia, Ubud", ["2"]),
  ];
  const next = groupsForOrganizationMode("nested", groups, ["1", "2"], "Indonésia");
  assert.equal(next.length, 2);
});

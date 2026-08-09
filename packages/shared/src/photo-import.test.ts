import assert from "node:assert/strict";
import test from "node:test";

import type { LocalPhotoMetadata } from "@moments-forever/types";

import {
  DEFAULT_PHOTO_GROUPING_CONFIG,
  createLocalFingerprint,
  createPhotoGroup,
  deselectAll,
  flagDuplicatePhotos,
  groupPhotos,
  isValidPhotoGroupPartition,
  mergePhotoGroups,
  movePhotosToGroup,
  movePhotosToUnknown,
  normalizePhotoMetadata,
  readySummary,
  selectAll,
  selectionTotals,
  toggleGroup,
  togglePhoto,
} from "./index.ts";

function photo(
  id: string,
  overrides: Partial<LocalPhotoMetadata> = {},
): LocalPhotoMetadata {
  return {
    id,
    name: `${id}.jpg`,
    size: 100,
    type: "image/jpeg",
    lastModified: 1_700_000_000_000,
    date: "2024-01-01T12:00:00.000Z",
    dateSource: "exif",
    gps: null,
    dimensions: null,
    exif: {
      availableFields: [],
      cameraMake: null,
      cameraModel: null,
      orientation: null,
    },
    fingerprint: id,
    duplicateOf: null,
    warnings: [],
    analysisMs: 1,
    ...overrides,
  };
}

test("normalizes GPS only when both coordinates are valid", () => {
  const valid = normalizePhotoMetadata({
    id: "one",
    name: "one.jpg",
    size: 10,
    type: "image/jpeg",
    lastModified: null,
    exifDate: null,
    latitude: -23.55,
    longitude: -46.63,
    width: null,
    height: null,
    orientation: null,
  });
  const incomplete = normalizePhotoMetadata({
    ...valid,
    exifDate: valid.date,
    latitude: -23.55,
    longitude: null,
    width: null,
    height: null,
    orientation: null,
  });
  assert.deepEqual(valid.gps, { latitude: -23.55, longitude: -46.63 });
  assert.equal(incomplete.gps, null);
});

test("prefers EXIF date and labels its source", () => {
  const result = normalizePhotoMetadata({
    id: "one",
    name: "one.jpg",
    size: 10,
    type: "image/jpeg",
    lastModified: Date.parse("2024-02-02T00:00:00Z"),
    exifDate: "2024-01-01T00:00:00Z",
    latitude: null,
    longitude: null,
    width: null,
    height: null,
    orientation: null,
  });
  assert.equal(result.date, "2024-01-01T00:00:00.000Z");
  assert.equal(result.dateSource, "exif");
});

test("uses file modification time only as an explicit fallback", () => {
  const result = normalizePhotoMetadata({
    id: "one",
    name: "one.jpg",
    size: 10,
    type: "image/jpeg",
    lastModified: Date.parse("2024-02-02T00:00:00Z"),
    exifDate: null,
    latitude: null,
    longitude: null,
    width: null,
    height: null,
    orientation: null,
  });
  assert.equal(result.date, "2024-02-02T00:00:00.000Z");
  assert.equal(result.dateSource, "file-last-modified");
});

test("keeps date unknown when neither source exists", () => {
  const result = normalizePhotoMetadata({
    id: "one",
    name: "one.jpg",
    size: 10,
    type: "image/jpeg",
    lastModified: null,
    exifDate: "not-a-date",
    latitude: null,
    longitude: null,
    width: null,
    height: null,
    orientation: null,
  });
  assert.equal(result.date, null);
  assert.equal(result.dateSource, "unknown");
});

test("groups nearby photos and never merges distant locations", () => {
  const groups = groupPhotos([
    photo("near-a", { gps: { latitude: 0, longitude: 0 } }),
    photo("near-b", { gps: { latitude: 0.01, longitude: 0 } }),
    photo("chain-but-distant", { gps: { latitude: 0.02, longitude: 0 } }),
    photo("far", { gps: { latitude: 10, longitude: 10 } }),
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0]?.photoIds, ["near-a", "near-b"]);
  assert.deepEqual(groups[1]?.photoIds, ["chain-but-distant"]);
  assert.deepEqual(groups[2]?.photoIds, ["far"]);
  assert.equal(groups[0]?.kind, "location-temporal");
  assert.equal(groups[0]?.label, "Lugar 1");
  assert.equal(groups[1]?.label, "Lugar 2");
});

test("applies the configurable temporal window within a location", () => {
  const photos = [
    photo("morning", {
      gps: { latitude: 25.1972, longitude: 55.2744 },
      date: "2026-08-12T08:00:00.000Z",
    }),
    photo("evening", {
      gps: { latitude: 25.1973, longitude: 55.2745 },
      date: "2026-08-12T16:00:00.000Z",
    }),
  ];
  assert.equal(groupPhotos(photos)[0]?.kind, "location");
  assert.equal(
    groupPhotos(photos, {
      ...DEFAULT_PHOTO_GROUPING_CONFIG,
      temporalWindowMs: 12 * 60 * 60 * 1_000,
    })[0]?.kind,
    "location-temporal",
  );
});

test("uses honest date-only and unknown groups without GPS", () => {
  const groups = groupPhotos([
    photo("dated"),
    photo("unknown", {
      date: null,
      dateSource: "unknown",
      lastModified: null,
    }),
  ]);
  assert.equal(groups[0]?.kind, "date");
  assert.match(groups[0]?.label ?? "", /local desconhecido/);
  assert.equal(groups[1]?.kind, "unknown");
});

test("selection operations are immutable and report counts and bytes", () => {
  const photos = [photo("a", { size: 100 }), photo("b", { size: 250 })];
  const all = selectAll(photos.map(({ id }) => id));
  const toggled = togglePhoto(all, "a");
  const restored = toggleGroup(toggled, ["a", "b"]);
  assert.deepEqual(all.selectedIds, ["a", "b"]);
  assert.deepEqual(toggled.selectedIds, ["b"]);
  assert.deepEqual(restored.selectedIds, ["b", "a"]);
  assert.deepEqual(selectionTotals(restored, photos), { count: 2, bytes: 350 });
  assert.deepEqual(deselectAll().selectedIds, []);
  assert.deepEqual(readySummary(restored, photos, groupPhotos(photos)), {
    selectedCount: 2,
    selectedGroupCount: 1,
    selectedOriginalBytes: 350,
  });
});

test("flags local fingerprint duplicates without discarding them", () => {
  const fingerprint = createLocalFingerprint({
    name: "same.jpg",
    size: 100,
    lastModified: 123,
    type: "image/jpeg",
  });
  const result = flagDuplicatePhotos([
    photo("first", { fingerprint }),
    photo("second", { fingerprint }),
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.duplicateOf, null);
  assert.equal(result[1]?.duplicateOf, "first");
});

test("moves photos between groups without changing import selection", () => {
  const photos = [
    photo("a", { gps: { latitude: 0, longitude: 0 }, size: 100 }),
    photo("b", { gps: { latitude: 0, longitude: 0 }, size: 200 }),
    photo("c", { gps: { latitude: 10, longitude: 10 }, size: 300 }),
  ];
  const groups = groupPhotos(photos);
  const selection = selectAll(photos.map(({ id }) => id));
  const moved = movePhotosToGroup(groups, ["b"], groups[1]?.id ?? "");
  assert.deepEqual(moved.map(({ photoIds }) => photoIds), [["a"], ["c", "b"]]);
  assert.equal(moved[0]?.kind, "manual");
  assert.equal(moved[1]?.kind, "manual");
  assert.equal(isValidPhotoGroupPartition(moved, ["a", "b", "c"]), true);
  assert.deepEqual(selectionTotals(selection, photos), {
    count: 3,
    bytes: 600,
  });
});

test("creates a manual group from photos in multiple source groups", () => {
  const photos = [
    photo("a", { gps: { latitude: 0, longitude: 0 } }),
    photo("b", { gps: { latitude: 0, longitude: 0 } }),
    photo("c", { gps: { latitude: 10, longitude: 10 } }),
  ];
  const created = createPhotoGroup(
    groupPhotos(photos),
    ["a", "c"],
    "manual-1",
    "Novo grupo",
  );
  assert.deepEqual(created.map(({ photoIds }) => photoIds), [
    ["b"],
    ["a", "c"],
  ]);
  assert.equal(created[1]?.label, "Novo grupo");
  assert.equal(created[1]?.kind, "manual");
  assert.equal(isValidPhotoGroupPartition(created, ["a", "b", "c"]), true);
});

test("merges groups in their current order and removes the sources", () => {
  const photos = [
    photo("a", { gps: { latitude: 0, longitude: 0 } }),
    photo("b", { gps: { latitude: 10, longitude: 10 } }),
    photo("c", { gps: { latitude: 20, longitude: 20 } }),
  ];
  const groups = groupPhotos(photos);
  const merged = mergePhotoGroups(
    groups,
    [groups[0]?.id ?? "", groups[2]?.id ?? ""],
    "manual-merged",
    "Grupo unido",
  );
  assert.deepEqual(merged.map(({ photoIds }) => photoIds), [
    ["a", "c"],
    ["b"],
  ]);
  assert.equal(merged[0]?.label, "Grupo unido");
  assert.equal(isValidPhotoGroupPartition(merged, ["a", "b", "c"]), true);
});

test("creates and removes the unknown bucket as photos move", () => {
  const photos = [
    photo("a", { gps: { latitude: 0, longitude: 0 } }),
    photo("b", { gps: { latitude: 10, longitude: 10 } }),
  ];
  const groups = groupPhotos(photos);
  const withUnknown = movePhotosToUnknown(groups, ["a"]);
  assert.deepEqual(withUnknown.find(({ id }) => id === "unknown")?.photoIds, [
    "a",
  ]);
  assert.equal(
    withUnknown.find(({ id }) => id === "unknown")?.label,
    "Desconhecido",
  );
  const restored = movePhotosToGroup(
    withUnknown,
    ["a"],
    withUnknown.find(({ id }) => id !== "unknown")?.id ?? "",
  );
  assert.equal(restored.some(({ id }) => id === "unknown"), false);
  assert.equal(isValidPhotoGroupPartition(restored, ["a", "b"]), true);
});

test("rejects invalid manual review operations", () => {
  const groups = groupPhotos([photo("a"), photo("b")]);
  const baseGroup = groups[0];
  assert.ok(baseGroup);
  assert.equal(
    isValidPhotoGroupPartition(
      [
        { ...baseGroup, photoIds: ["a"] },
        { ...baseGroup, photoIds: ["b"] },
      ],
      ["a", "b"],
    ),
    false,
  );
  assert.throws(
    () => createPhotoGroup(groups, [], "manual-empty", "Grupo"),
    /pelo menos uma foto/,
  );
  assert.throws(
    () => movePhotosToGroup(groups, ["missing"], groups[0]?.id ?? ""),
    /não pertence/,
  );
  assert.throws(
    () => mergePhotoGroups(groups, [groups[0]?.id ?? ""], "manual-1", "Grupo"),
    /pelo menos dois grupos/,
  );
});

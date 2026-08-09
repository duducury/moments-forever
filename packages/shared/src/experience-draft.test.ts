import assert from "node:assert/strict";
import test from "node:test";

import type {
  LocalPhotoMetadata,
  PhotoImportGroup,
} from "@moments-forever/types";

import {
  buildExperienceDraftFromImport,
  mapLocalDateSourceToDb,
  suggestCoverPhotoId,
  suggestExperienceTitle,
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
    date: "2024-06-12T10:00:00.000Z",
    dateSource: "exif",
    gps: null,
    dimensions: { width: 100, height: 80, orientation: null },
    exif: {
      availableFields: ["DateTimeOriginal"],
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

function group(
  id: string,
  overrides: Partial<PhotoImportGroup> = {},
): PhotoImportGroup {
  return {
    id,
    kind: "location",
    label: `Local ${id}`,
    photoIds: [],
    roundedGps: null,
    date: null,
    ...overrides,
  };
}

test("mapLocalDateSourceToDb: exif_original and exif_created", () => {
  assert.deepEqual(
    mapLocalDateSourceToDb("exif_original", "2024-01-01T00:00:00.000Z"),
    {
      dateSource: "exif_original",
      capturedAt: "2024-01-01T00:00:00.000Z",
    },
  );
  assert.deepEqual(
    mapLocalDateSourceToDb("exif_created", "2024-01-02T00:00:00.000Z"),
    {
      dateSource: "exif_created",
      capturedAt: "2024-01-02T00:00:00.000Z",
    },
  );
});

test("mapLocalDateSourceToDb: file-last-modified and unknown are absent", () => {
  assert.deepEqual(
    mapLocalDateSourceToDb("file-last-modified", "2024-01-01T00:00:00.000Z"),
    { dateSource: "absent", capturedAt: null },
  );
  assert.deepEqual(mapLocalDateSourceToDb("unknown", null), {
    dateSource: "absent",
    capturedAt: null,
  });
});

test("mapLocalDateSourceToDb: bare exif refined only by available fields", () => {
  assert.deepEqual(
    mapLocalDateSourceToDb("exif", "2024-01-01T00:00:00.000Z", [
      "DateTimeOriginal",
    ]),
    {
      dateSource: "exif_original",
      capturedAt: "2024-01-01T00:00:00.000Z",
    },
  );
  assert.deepEqual(
    mapLocalDateSourceToDb("exif", "2024-01-01T00:00:00.000Z", ["CreateDate"]),
    {
      dateSource: "exif_created",
      capturedAt: "2024-01-01T00:00:00.000Z",
    },
  );
  assert.deepEqual(
    mapLocalDateSourceToDb("exif", "2024-01-01T00:00:00.000Z", []),
    { dateSource: "absent", capturedAt: null },
  );
});

test("suggestCoverPhotoId uses first photo in moment then position order", () => {
  const cover = suggestCoverPhotoId(
    [
      { id: "p2", momentId: "m1", positionInMoment: 2 },
      { id: "p1", momentId: "m1", positionInMoment: 1 },
      { id: "p3", momentId: "m2", positionInMoment: 1 },
    ],
    ["m1", "m2"],
  );
  assert.equal(cover, "p1");
});

test("buildExperienceDraftFromImport: groups, unknown, selection, order, GPS, dates, cover", () => {
  const photos = [
    photo("p1", {
      date: "2024-06-12T09:00:00.000Z",
      dateSource: "exif",
      gps: { latitude: 38.72, longitude: -9.14 },
      exif: {
        availableFields: ["DateTimeOriginal"],
        cameraMake: null,
        cameraModel: null,
        orientation: null,
      },
    }),
    photo("p2", {
      date: "2024-06-12T11:00:00.000Z",
      dateSource: "exif",
      gps: { latitude: 38.73, longitude: -9.15 },
      exif: {
        availableFields: ["CreateDate"],
        cameraMake: null,
        cameraModel: null,
        orientation: null,
      },
    }),
    photo("p3", {
      date: "2024-06-13T10:00:00.000Z",
      dateSource: "file-last-modified",
      gps: null,
      exif: {
        availableFields: [],
        cameraMake: null,
        cameraModel: null,
        orientation: null,
      },
    }),
    photo("p4", {
      date: null,
      dateSource: "unknown",
      gps: null,
      dimensions: null,
      exif: {
        availableFields: [],
        cameraMake: null,
        cameraModel: null,
        orientation: null,
      },
    }),
    photo("p5", {
      date: "2024-06-14T10:00:00.000Z",
      gps: { latitude: 41.15, longitude: -8.61 },
    }),
  ];

  const groups: PhotoImportGroup[] = [
    group("lisboa", {
      kind: "location-temporal",
      label: "Lisboa",
      photoIds: ["p1", "p2", "p5-skip"],
    }),
    group("unknown", {
      kind: "unknown",
      label: "Desconhecido",
      photoIds: ["p3", "p4"],
    }),
    group("porto", {
      kind: "location",
      label: "Porto",
      photoIds: ["p5"],
    }),
  ];

  const draft = buildExperienceDraftFromImport({
    ownerId: "user-1",
    title: "Portugal em familia",
    slug: "portugal-test",
    experienceId: "exp-1",
    photos,
    groups,
    // p5-skip missing from photos; p5 selected later; deselect nothing from lisboa except we omit p5 from first group
    selectedIds: ["p1", "p2", "p3", "p4", "p5"],
  });

  assert.equal(draft.moments.length, 3);
  assert.deepEqual(
    draft.moments.map((moment) => ({
      id: moment.id,
      position: moment.position,
      placeId: moment.placeId,
      title: moment.title,
    })),
    [
      {
        id: "moment:lisboa",
        position: 1,
        placeId: "place:lisboa",
        title: "Lisboa",
      },
      {
        id: "moment:unknown",
        position: 2,
        placeId: null,
        title: "Desconhecido",
      },
      {
        id: "moment:porto",
        position: 3,
        placeId: "place:porto",
        title: "Porto",
      },
    ],
  );

  assert.equal(draft.places.length, 2);
  assert.equal(draft.places[0]?.id, "place:lisboa");
  assert.equal(draft.places[0]?.locationSource, "gps");
  assert.equal(draft.places[0]?.exactLatitude, (38.72 + 38.73) / 2);
  assert.equal(draft.places[0]?.exactLongitude, (-9.14 + -9.15) / 2);
  assert.equal(draft.places[1]?.id, "place:porto");

  assert.deepEqual(
    draft.photos.map((item) => ({
      id: item.id,
      momentId: item.momentId,
      positionInMoment: item.positionInMoment,
      dateSource: item.dateSource,
      capturedAt: item.capturedAt,
      exactLatitude: item.exactLatitude,
    })),
    [
      {
        id: "p1",
        momentId: "moment:lisboa",
        positionInMoment: 1,
        dateSource: "exif_original",
        capturedAt: "2024-06-12T09:00:00.000Z",
        exactLatitude: 38.72,
      },
      {
        id: "p2",
        momentId: "moment:lisboa",
        positionInMoment: 2,
        dateSource: "exif_created",
        capturedAt: "2024-06-12T11:00:00.000Z",
        exactLatitude: 38.73,
      },
      {
        id: "p3",
        momentId: "moment:unknown",
        positionInMoment: 1,
        dateSource: "absent",
        capturedAt: null,
        exactLatitude: null,
      },
      {
        id: "p4",
        momentId: "moment:unknown",
        positionInMoment: 2,
        dateSource: "absent",
        capturedAt: null,
        exactLatitude: null,
      },
      {
        id: "p5",
        momentId: "moment:porto",
        positionInMoment: 1,
        dateSource: "exif_original",
        capturedAt: "2024-06-14T10:00:00.000Z",
        exactLatitude: 41.15,
      },
    ],
  );

  assert.equal(draft.experience.coverPhotoId, "p1");
  assert.equal(draft.experience.status, "draft");
  assert.equal(draft.experience.visibility, "private");
  assert.equal(draft.experience.primaryCity, null);
  assert.equal(draft.experience.primaryCountry, null);
  assert.equal(draft.experience.startsAt, "2024-06-12T09:00:00.000Z");
  assert.equal(draft.experience.endsAt, "2024-06-14T10:00:00.000Z");
});

test("buildExperienceDraftFromImport: only selected photos are persisted", () => {
  const photos = [
    photo("keep", { gps: { latitude: 1, longitude: 2 } }),
    photo("drop", { gps: { latitude: 3, longitude: 4 } }),
  ];
  const draft = buildExperienceDraftFromImport({
    ownerId: "user-1",
    title: "Selecao",
    slug: "selecao",
    photos,
    groups: [
      group("g1", {
        kind: "location",
        label: "Local 1",
        photoIds: ["keep", "drop"],
      }),
    ],
    selectedIds: ["keep"],
  });

  assert.deepEqual(
    draft.photos.map((item) => item.id),
    ["keep"],
  );
  assert.equal(draft.photos[0]?.positionInMoment, 1);
  assert.equal(draft.moments.length, 1);
  assert.equal(draft.moments[0]?.position, 1);
});

test("buildExperienceDraftFromImport: GPS absent yields moment without place", () => {
  const draft = buildExperienceDraftFromImport({
    ownerId: "user-1",
    title: "Sem GPS",
    slug: "sem-gps",
    photos: [photo("only", { gps: null, dateSource: "unknown", date: null })],
    groups: [
      group("date-1", {
        kind: "date",
        label: "2024-06-12",
        photoIds: ["only"],
      }),
    ],
    selectedIds: ["only"],
  });

  assert.equal(draft.places.length, 0);
  assert.equal(draft.moments[0]?.placeId, null);
  assert.equal(draft.photos[0]?.exactLatitude, null);
  assert.equal(draft.photos[0]?.exactLongitude, null);
  assert.equal(draft.photos[0]?.dateSource, "absent");
  assert.equal(draft.photos[0]?.capturedAt, null);
});

test("buildExperienceDraftFromImport does not invent city or country", () => {
  const draft = buildExperienceDraftFromImport({
    ownerId: "user-1",
    title: "Viagem",
    slug: "viagem",
    photos: [photo("a", { gps: { latitude: 10, longitude: 20 } })],
    groups: [
      group("g", {
        kind: "location",
        label: "Local 1",
        photoIds: ["a"],
      }),
    ],
    selectedIds: ["a"],
  });
  assert.equal(draft.experience.primaryCity, null);
  assert.equal(draft.experience.primaryCountry, null);
});

test("suggestExperienceTitle never uses Lugar/Local N as the trip name", () => {
  const photos = [
    photo("a", { gps: { latitude: 10, longitude: 20 } }),
    photo("b", { gps: { latitude: 11, longitude: 21 } }),
  ];
  const title = suggestExperienceTitle({
    groups: [
      group("g1", {
        kind: "location",
        label: "Lugar 1",
        photoIds: ["a"],
      }),
      group("g2", {
        kind: "location",
        label: "Local 2",
        photoIds: ["b"],
      }),
    ],
    selectedIds: ["a", "b"],
    photos,
  });
  assert.equal(title, "Viagem 2024");
});

test("suggestExperienceTitle prefers a manual place rename", () => {
  assert.equal(
    suggestExperienceTitle({
      groups: [
        group("g", {
          kind: "manual",
          label: "Indonésia 2026",
          photoIds: ["a"],
        }),
      ],
      selectedIds: ["a"],
      photos: [photo("a")],
    }),
    "Indonésia 2026",
  );
});

test("buildExperienceDraftFromImport: auto Local N place stays unconfirmed", () => {
  const draft = buildExperienceDraftFromImport({
    ownerId: "user-1",
    title: "Viagem",
    slug: "viagem",
    photos: [photo("a", { gps: { latitude: 10, longitude: 20 } })],
    groups: [
      group("g", {
        kind: "location",
        label: "Local 1 · 10.00, 20.00",
        photoIds: ["a"],
      }),
    ],
    selectedIds: ["a"],
  });
  assert.equal(draft.places[0]?.name, "Local 1");
  assert.equal(draft.places[0]?.confirmedByUser, false);
  assert.equal(draft.moments[0]?.title, "Local 1");
});

test("buildExperienceDraftFromImport: manual place name is confirmed", () => {
  const draft = buildExperienceDraftFromImport({
    ownerId: "user-1",
    title: "Viagem",
    slug: "viagem",
    photos: [photo("a", { gps: { latitude: 10, longitude: 20 } })],
    groups: [
      group("g", {
        kind: "manual",
        label: "Nusa Penida",
        photoIds: ["a"],
      }),
    ],
    selectedIds: ["a"],
  });
  assert.equal(draft.places[0]?.name, "Nusa Penida");
  assert.equal(draft.places[0]?.confirmedByUser, true);
});

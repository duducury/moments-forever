import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
import { shareFile } from "@/lib/share/share-link";

import { layoutWorldMap, projectFlat, type MapFrame } from "./journey-geo";
import {
  MAX_FAVORITE_TRIPS,
  buildJourneySummary,
  clusterJourneyPoints,
  formatTripDates,
  journeyPeriodLabel,
  journeyStats,
  selectFavoriteTrips,
  selectionCounterLabel,
  toggleTripSelection,
  tripDisplayName,
  type JourneyPoint,
} from "./journey-summary";

const CITIES = [
  ["Bali, Indonésia", "ID", "2026-07-26", "2026-08-04", 30],
  ["Dubai, Emirados Árabes Unidos", "AE", "2026-07-21", "2026-08-05", 25],
  ["Rio de Janeiro, Brasil", "BR", "2025-12-30", "2026-01-27", 40],
  ["Nova York, Estados Unidos", "US", "2020-01-31", "2020-01-31", 12],
  ["Las Vegas, Estados Unidos", "US", "2025-11-04", "2025-11-07", 18],
  ["Paris, França", "FR", "2019-05-02", "2019-05-09", 22],
  ["Roma, Itália", "IT", "2024-04-10", "2024-04-14", 9],
] as const;

/** Test-only trips; the production code never ships with data like this. */
function place(i: number): OwnerPlaceCardItem {
  const [title, countryCode, startsAt, endsAt, photoCount] = CITIES[i % CITIES.length]!;
  return {
    albumId: `album-${i}`,
    experienceId: `exp-${i}`,
    experienceSlug: `slug-${i}`,
    experienceTitle: title,
    title,
    countryCode,
    startsAt,
    endsAt,
    coverPhotoId: `cover-${i}`,
    coverFocus: null,
    previewPhotoIds: [],
    photoCount,
  };
}
const trips = (n: number) => Array.from({ length: n }, (_, i) => place(i));
const ids = (n: number) => trips(n).map((t) => t.albumId);

function build(n: number, selected: string[]) {
  return buildJourneySummary({
    places: trips(n),
    displayName: "Pessoa Teste",
    bio: " Minha bio ",
    countryCodes: ["BR", "US"],
    selectedAlbumIds: selected,
    points: [],
  });
}

test("selection: at most 5, a 6th is refused, and a selection can be removed", () => {
  let selected: string[] = [];
  for (const id of ids(7)) selected = toggleTripSelection(selected, id);
  assert.equal(selected.length, MAX_FAVORITE_TRIPS);
  assert.deepEqual(selected, ids(5), "the 6th and 7th were refused");
  assert.deepEqual(toggleTripSelection(selected, "album-5"), selected);
  const removed = toggleTripSelection(selected, "album-2");
  assert.equal(removed.length, 4);
  assert.equal(removed.includes("album-2"), false);
  assert.deepEqual(toggleTripSelection(removed, "album-5").length, 5, "a slot freed up");
});

test("the counter reads 0 de 5, 1 de 5…", () => {
  assert.equal(selectionCounterLabel(0), "0 de 5 selecionadas");
  assert.equal(selectionCounterLabel(1), "1 de 5 selecionadas");
  assert.equal(selectionCounterLabel(5), "5 de 5 selecionadas");
});

test("users with 0, 1, 3, 5 and more than 5 trips", () => {
  const zero = build(0, []);
  assert.deepEqual(zero.stats, { trips: 0, countries: 0, cities: 0, photos: 0 });
  assert.equal(zero.period, null);
  assert.deepEqual(zero.favorites, []);

  assert.equal(build(1, ids(1)).favorites.length, 1);
  const three = build(3, ids(3));
  assert.equal(three.favorites.length, 3, "only what was picked: no filler");
  assert.equal(build(5, ids(5)).favorites.length, 5);
  const many = build(7, ids(7));
  assert.equal(many.favorites.length, 5, "capped at 5 even if more ids are passed");
  assert.equal(many.stats.trips, 7);
});

test("favourites are exactly the picked trips, in picked order, with real data", () => {
  const favorites = selectFavoriteTrips(trips(7), ["album-3", "album-0", "album-3", "nope"]);
  assert.deepEqual(favorites.map((f) => f.albumId), ["album-3", "album-0"]);
  assert.equal(favorites[0]!.name, "Nova York");
  assert.equal(favorites[0]!.countryCode, "US");
  assert.equal(favorites[0]!.dates, "31 jan 2020");
  assert.equal(favorites[0]!.coverPhotoId, "cover-3");
  assert.equal(favorites[1]!.dates, "26 jul – 4 ago 2026");
  assert.ok(favorites[1]!.countryName, "country name comes from the code");
});

test("statistics come from the trips (not hard-coded)", () => {
  const stats = journeyStats(trips(5));
  assert.equal(stats.trips, 5);
  assert.equal(stats.photos, 30 + 25 + 40 + 12 + 18);
  assert.equal(stats.countries, 4, "ID, AE, BR, US");
  assert.notEqual(journeyStats(trips(3)).photos, stats.photos);
});

test("period and dates are computed from the trips", () => {
  assert.equal(journeyPeriodLabel(trips(7)), "2019 - 2026");
  assert.equal(journeyPeriodLabel([place(3)]), "2020");
  assert.equal(journeyPeriodLabel([{ ...place(0), startsAt: null, endsAt: null }]), null);
  assert.equal(formatTripDates("2025-12-30", "2026-01-27"), "30 dez 2025 – 27 jan 2026");
  assert.equal(formatTripDates(null, null), null);
  assert.equal(tripDisplayName("Rio de Janeiro, Brasil"), "Rio de Janeiro");
});

test("map points are grouped into places from real GPS photos", () => {
  const points: JourneyPoint[] = [
    { photoId: "a", albumId: "x", latitude: 25.2, longitude: 55.3, capturedAt: "2026-07-21T10:00:00Z" },
    { photoId: "b", albumId: "x", latitude: 25.3, longitude: 55.1, capturedAt: "2026-07-22T10:00:00Z" },
    { photoId: "c", albumId: "y", latitude: -22.9, longitude: -43.2, capturedAt: "2026-01-01T10:00:00Z" },
    { photoId: "bad", albumId: null, latitude: Number.NaN, longitude: 0, capturedAt: null },
    { photoId: "bad2", albumId: null, latitude: 120, longitude: 0, capturedAt: null },
  ];
  const clusters = clusterJourneyPoints(points);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0]!.count, 2, "biggest first");
  assert.equal(clusters[0]!.firstAt, "2026-07-21T10:00:00Z");
  assert.deepEqual(clusterJourneyPoints([]), []);
});

const FRAME: MapFrame = { x: 0, y: 646, width: 1080, height: 564, lonMin: -180, lonMax: 180, latMin: -58, latMax: 84, yStretch: 1.32, curveRadius: 1500 };

/** Test-only GPS photos: 225 across the whole world, in 6 trips plus extra places. */
function worldPoints(): JourneyPoint[] {
  const spots = [
    [-8.4, 115.2, 20], [25.2, 55.3, 35], [-22.9, -43.2, 50], [40.7, -74, 10], [36.1, -115.1, 15],
    [48.85, 2.35, 22], [35.7, 139.7, 18], [-33.9, 151.2, 12], [64.1, -21.9, 8], [-13.5, -71.97, 15], [-33.9, 18.4, 10], [19.4, -99.1, 10],
  ] as const;
  return spots.flatMap(([lat, lon, n], i) =>
    Array.from({ length: n }, (_, k) => ({
      photoId: `p${i}-${k}`,
      albumId: `album-${i % 7}`,
      latitude: lat + (k % 5) * 0.03,
      longitude: lon + (k % 7) * 0.03,
      capturedAt: `20${19 + (i % 8)}-0${1 + (i % 9)}-10T10:00:00Z`,
    })),
  );
}

test("map: the whole world fits across the image, so no place is hidden", () => {
  const a = projectFlat(-175, 84, FRAME);
  const b = projectFlat(175, -58, FRAME);
  assert.ok(a.x >= FRAME.x && b.x <= FRAME.x + FRAME.width, "all longitudes inside the panel");
  assert.ok(a.y >= FRAME.y && b.y <= FRAME.y + FRAME.height + 120, "all latitudes inside the band (plus the horizon curve)");
  assert.ok(projectFlat(-179, 40, FRAME).y > projectFlat(0, 40, FRAME).y, "the horizon curves down towards the sides");
  const opposite = [projectFlat(-74, 40.7, FRAME), projectFlat(115.2, -8.4, FRAME)];
  assert.ok(opposite.every((p) => p.x > FRAME.x && p.x < FRAME.x + FRAME.width), "opposite sides of the Earth both show");
});

test("the map is fed by ALL GPS photos, never by the favourite trips", () => {
  const points = worldPoints();
  assert.equal(points.length, 225);
  const none = buildJourneySummary({ places: trips(7), displayName: "x", bio: null, countryCodes: [], selectedAlbumIds: [], points });
  const five = buildJourneySummary({ places: trips(7), displayName: "x", bio: null, countryCodes: [], selectedAlbumIds: ids(5), points });
  assert.deepEqual(none.clusters, five.clusters, "the selection does not change the map data");
  assert.equal(none.gpsPhotoCount, 225);
  assert.equal(five.gpsPhotoCount, 225);
  assert.equal(five.favorites.length, 5, "…and the selection still drives the cards");
  assert.equal(none.favorites.length, 0);
  assert.equal(five.clusters.reduce((sum, c) => sum + c.count, 0), 225, "every GPS photo is counted in some place");
});

test("layout: every place becomes a pin or a dot, pins do not overlap, and there are no routes", () => {
  const { clusters } = buildJourneySummary({ places: trips(7), displayName: "x", bio: null, countryCodes: [], selectedAlbumIds: [], points: worldPoints() });
  const layout = layoutWorldMap(clusters, FRAME);
  assert.equal(layout.pins.length + layout.unpinned.length, clusters.length, "nothing is dropped");
  assert.ok(layout.pins.length >= 3 && layout.pins.length <= 9);
  for (const a of layout.pins)
    for (const b of layout.pins) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 105);
  for (const pin of layout.pins) assert.ok(pin.y - 112 >= FRAME.y, "pin head stays near the horizon");
  assert.equal("routes" in layout, false, "no connecting lines");
  assert.deepEqual(layoutWorldMap([], FRAME), { pins: [], unpinned: [] });
});

test("the renderer draws no routes or planes, and the map is the flat panel", () => {
  const renderer = read("src/lib/share-journey/render-journey-image.ts");
  assert.doesNotMatch(renderer, /drawPlane|setLineDash|routes|greatCircle|drawGlobe/);
  assert.match(renderer, /drawWorldMap/);
  assert.doesNotMatch(renderer, /roundRect\(ctx, MAP|createRadialGradient\(item\.x/, "no box around the map and no glowing dots");
  assert.match(renderer, /horizonDrop/, "curved horizon");
});

test("shareFile: shares the image, stays quiet on cancel, reports unsupported browsers", async () => {
  const file = { name: "x.jpg" } as unknown as File;
  const calls: unknown[] = [];
  const ok = { canShare: () => true, async share(d: unknown) { calls.push(d); } };
  assert.equal(await shareFile(file, { title: "T", text: "X" }, { navigator: ok }), "shared");
  assert.deepEqual(calls, [{ files: [file], title: "T", text: "X" }]);
  const cancelled = {
    canShare: () => true,
    async share() {
      throw Object.assign(new Error("c"), { name: "AbortError" });
    },
  };
  assert.equal(await shareFile(file, {}, { navigator: cancelled }), "cancelled");
  assert.equal(await shareFile(file, {}, { navigator: {} }), "unsupported");
  assert.equal(await shareFile(file, {}, { navigator: { share: async () => {}, canShare: () => false } }), "unsupported");
});

// ---- no mocked data in production code, and the feature is wired where asked ----

const WEB = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(WEB, file), "utf8");

test("the generator and renderer contain no hard-coded people, trips or numbers", () => {
  for (const file of [
    "src/lib/share-journey/render-journey-image.ts",
    "src/lib/share-journey/generate-journey-image.ts",
    "src/lib/share-journey/journey-summary.ts",
    "src/app/perfil/share-journey-section.tsx",
  ]) {
    const source = read(file);
    for (const forbidden of ["Eduardo", "Cury", "Bali", "Dubai", "Rio de Janeiro", "Nova York", "Las Vegas", "245", "17 viagens"]) {
      assert.equal(source.includes(forbidden), false, `${file} mentions ${forbidden}`);
    }
  }
  const renderer = read("src/lib/share-journey/render-journey-image.ts");
  assert.match(renderer, /JOURNEY_IMAGE_WIDTH = 1080/);
  assert.match(renderer, /JOURNEY_IMAGE_HEIGHT = 1920/);
  assert.match(renderer, /Minhas viagens favoritas/);
  assert.match(renderer, /Colecionando/);
  assert.doesNotMatch(read("src/lib/share-journey/generate-journey-image.ts"), /openai|stable-diffusion|generateImage\(/i);
});

test("the section sits at the end of the owner's profile, with the requested texts", () => {
  const view = read("src/app/perfil/profile-view.tsx");
  assert.match(view, /isOwner && !loadError && !gridPending && places\.length > 0 \? \(\s*<ShareJourneySection/);
  assert.ok(view.indexOf("mapSlot : null") < view.indexOf("<ShareJourneySection"), "after the trips and the map");
  assert.ok(view.indexOf("<ProfileHeader") < view.indexOf("<ShareJourneySection"), "not at the top");
  const section = read("src/app/perfil/share-journey-section.tsx");
  for (const text of [
    "Compartilhe sua jornada",
    "Mostre ao mundo os lugares que fizeram parte da sua história.",
    "Compartilhar minha jornada no Instagram",
    "Escolha suas viagens favoritas",
    "Selecione até 5 viagens para aparecerem no seu resumo.",
    "Gerar meu resumo",
    "Compartilhar no Instagram",
    "Salvar imagem",
  ]) {
    assert.ok(section.includes(text), text);
  }
  assert.doesNotMatch(section, /localStorage|favorites?Table|supabase/i, "the selection is not persisted");
});

test("the journey-points API is owner-only", () => {
  const route = read("src/app/api/me/journey-points/route.ts");
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /loadOwnerMapPhotos\(supabase, user\.id\)/);
});

test("the picker dialog sits above the bottom menu so 'Gerar meu resumo' is always reachable", () => {
  const section = read("src/app/perfil/share-journey-section.tsx");
  assert.match(section, /createPortal\(/, "rendered on <body>, free of transformed ancestors");
  const css = read("src/app/perfil/share-journey.module.css");
  assert.match(css, /\.overlay\s*\{[^}]*z-index: var\(--z-modal/);
  const globals = read("src/app/globals.css");
  const zModal = Number(globals.match(/--z-modal:\s*(\d+)/)?.[1]);
  const zDrawer = Number(globals.match(/--z-drawer:\s*(\d+)/)?.[1]);
  assert.ok(zModal > zDrawer, "modal layer is above the bottom nav (drawer) layer");
  assert.match(read("src/components/app-bottom-nav.module.css"), /z-index: var\(--z-drawer\)/);
});


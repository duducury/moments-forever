import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
import { shareFile } from "@/lib/share/share-link";

import { layoutMapViews, layoutWorldMap, pinHeadCentre, projectFlat, type MapFrame } from "./journey-geo";
import {
  JOURNEY_REGIONS,
  NO_TRIPS_IN_REGION_MESSAGE,
  pointsForRegion,
  regionMap,
  statColumns,
  toggleRegionTrip,
  tripsForRegion,
  type JourneyRegion,
} from "./journey-regions";
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
  assert.deepEqual(zero.stats, { trips: 0, countries: 0, cities: 0, photos: 0, states: 0 });
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

/** Test-only: a traveller with many trips inside the USA plus the rest of the world. */
const US_SPOTS = [
  ["New York", 40.71, -74.0, 50], ["Boston", 42.36, -71.06, 10], ["New Hampshire", 43.2, -71.5, 6], ["New Jersey", 40.73, -74.17, 8],
  ["Connecticut", 41.76, -72.69, 5], ["Ohio", 39.96, -83.0, 7], ["Texas", 29.76, -95.37, 12], ["Florida", 25.76, -80.19, 20],
  ["Nevada", 36.17, -115.14, 15], ["Hawaii", 21.31, -157.86, 9], ["California", 34.05, -118.24, 11],
] as const;
const WORLD_SPOTS = [
  ["Dubai", 25.2, 55.3, 35], ["Rio", -22.9, -43.2, 40], ["Salvador", -12.97, -38.5, 8], ["Sao Paulo", -23.55, -46.63, 6],
  ["Paris", 48.85, 2.35, 22], ["Roma", 41.9, 12.5, 9], ["Bali", -8.4, 115.2, 20], ["Tokyo", 35.7, 139.7, 18], ["Sydney", -33.9, 151.2, 12],
] as const;
function spotsToPoints(spots: readonly (readonly [string, number, number, number])[]): JourneyPoint[] {
  return spots.flatMap(([name, lat, lon, n]) =>
    Array.from({ length: n }, (_, k) => ({
      photoId: `${name}-${k}`,
      albumId: null,
      latitude: lat + (k % 5) * 0.02,
      longitude: lon + (k % 7) * 0.02,
      capturedAt: "2024-05-10T10:00:00Z",
    })),
  );
}
const SPREAD = buildJourneySummary({
  places: trips(7), displayName: "x", bio: null, countryCodes: [], selectedAlbumIds: [],
  points: spotsToPoints([...US_SPOTS, ...WORLD_SPOTS]),
});

test("places are grouped by real distance: different cities/states never merge", () => {
  // New York and New Jersey (~15 km apart) are one place; Boston, Ohio, Texas, Florida… are not.
  const near = (lat: number, lon: number) => SPREAD.clusters.filter((c) => Math.hypot(c.latitude - lat, c.longitude - lon) < 1.5);
  assert.equal(near(40.71, -74.0).length, 1, "NY + NJ = one metro area");
  assert.equal(near(40.71, -74.0)[0]!.count, 58);
  for (const [lat, lon] of [[42.36, -71.06], [39.96, -83.0], [29.76, -95.37], [25.76, -80.19], [36.17, -115.14], [21.31, -157.86]] as const) {
    assert.ok(near(lat, lon).length >= 1, `place near ${lat},${lon} exists on its own`);
  }
  assert.ok(SPREAD.clusters.length >= 15, "many distinct places, not one per country");
});

test("pins are spread over the USA: several different destinations, not a single pin", () => {
  const layout = layoutWorldMap(SPREAD.clusters, FRAME, { skyAllowance: 70 });
  const inUsa = layout.pins.filter((p) => p.cluster.longitude < -60 && p.cluster.latitude > 15 && p.cluster.latitude < 50);
  assert.ok(inUsa.length >= 4, `USA got ${inUsa.length} pins`);
  const has = (lat: number, lon: number) => layout.pins.some((p) => Math.abs(p.cluster.latitude - lat) < 1.5 && Math.abs(p.cluster.longitude - lon) < 1.5);
  for (const [name, lat, lon] of [["Texas", 29.76, -95.37], ["Florida", 25.76, -80.19], ["New York", 40.71, -74.0]] as const) {
    assert.ok(has(lat, lon), `${name} has its own pin`);
  }
  // Pins elsewhere in the world still appear (the USA does not eat them all).
  const outside = layout.pins.filter((p) => !(p.cluster.longitude < -60 && p.cluster.latitude > 15 && p.cluster.latitude < 50));
  assert.ok(outside.length >= 5, `${outside.length} pins outside the USA`);
  for (const [lat, lon] of [[25.2, 55.3], [-22.9, -43.2], [48.85, 2.35], [35.7, 139.7]] as const) assert.ok(has(lat, lon), `${lat},${lon} pinned`);
});

/** Test-only destinations (lat, lon, photos). The algorithm only ever sees coordinates. */
const BRAZIL = [[-22.9, -43.2, 30], [-23.55, -46.63, 12], [-12.97, -38.5, 15], [-3.73, -38.52, 9], [-8.05, -34.9, 8], [-30.03, -51.23, 7], [-25.43, -49.27, 6], [-15.8, -47.9, 5]] as const;
const EUROPE = [[48.85, 2.35, 22], [41.9, 12.5, 14], [40.42, -3.7, 10], [51.5, -0.12, 12], [52.52, 13.4, 8], [38.7, -9.14, 7], [47.5, 19.04, 6], [37.98, 23.73, 6]] as const;
const ASIA = [[35.7, 139.7, 18], [13.75, 100.5, 9], [-8.4, 115.2, 20], [1.35, 103.8, 10], [25.2, 55.3, 25], [28.6, 77.2, 7]] as const;
const CARIBBEAN = [[18.47, -69.9, 10], [18.0, -76.8, 9], [23.1, -82.4, 8], [12.1, -68.9, 6], [25.04, -77.35, 8]] as const;
type Spot = readonly [number, number, number];
const toPoints = (spots: readonly Spot[]): JourneyPoint[] =>
  spots.flatMap(([lat, lon, n], i) =>
    Array.from({ length: n }, (_, k) => ({ photoId: `${lat},${lon}-${i}-${k}`, albumId: null, latitude: lat + (k % 5) * 0.02, longitude: lon + (k % 7) * 0.02, capturedAt: null })),
  );
const pinsFor = (spots: readonly Spot[]) =>
  layoutWorldMap(clusterJourneyPoints(toPoints(spots)), FRAME, { skyAllowance: 70 }).pins;
const inBox = (pins: ReturnType<typeof pinsFor>, lat: [number, number], lon: [number, number]) =>
  pins.filter((p) => p.cluster.latitude >= lat[0] && p.cluster.latitude <= lat[1] && p.cluster.longitude >= lon[0] && p.cluster.longitude <= lon[1]);

test("the distribution is geographic, not per country: any dense region gets several pins", () => {
  // No United States data at all: Brazil, Europe, Asia and the Caribbean are all dense.
  const pins = pinsFor([...BRAZIL, ...EUROPE, ...ASIA, ...CARIBBEAN]);
  assert.ok(inBox(pins, [-35, 6], [-55, -33]).length >= 2, "several pins across Brazil");
  assert.ok(inBox(pins, [35, 60], [-12, 28]).length >= 3, "several pins across Europe");
  assert.ok(inBox(pins, [-10, 30], [75, 145]).length >= 3, "several pins across Asia");
  assert.ok(inBox(pins, [10, 26], [-85, -66]).length >= 1, "the Caribbean is represented");
  assert.ok(pins.length <= 18, "still capped");
});

test("one dense region does not starve the others, whichever region it is", () => {
  const only = (dense: readonly Spot[]) => pinsFor([...dense, [-22.9, -43.2, 3], [35.7, 139.7, 3], [48.85, 2.35, 3], [-33.9, 151.2, 3], [40.7, -74, 3]]);
  for (const dense of [BRAZIL, EUROPE, ASIA, CARIBBEAN]) {
    const pins = only(dense);
    for (const [lat, lon] of [[35.7, 139.7], [-33.9, 151.2], [40.7, -74]] as const) {
      assert.ok(pins.some((p) => Math.abs(p.cluster.latitude - lat) < 1.5 && Math.abs(p.cluster.longitude - lon) < 1.5), `${lat},${lon} keeps a pin`);
    }
  }
});

test("the layout algorithm only reads coordinates (no country, state or region names)", () => {
  const geo = read("src/lib/share-journey/journey-geo.ts");
  assert.doesNotMatch(geo, /countryCode|countryName|"US"|"BR"|Brasil|Estados Unidos|United States/);
  assert.doesNotMatch(read("src/lib/share-journey/render-journey-image.ts"), /planJourneyPins[\s\S]{0,200}countryCode/);
});

test("layout: every place is a pin or unpinned, heads never overlap, nothing leaves the image", () => {
  const layout = layoutWorldMap(SPREAD.clusters, FRAME, { skyAllowance: 70 });
  assert.equal(layout.pins.length + layout.unpinned.length, SPREAD.clusters.length, "no place is lost");
  assert.ok(layout.pins.length >= 9 && layout.pins.length <= 18, `${layout.pins.length} pins`);
  for (const a of layout.pins) {
    for (const b of layout.pins) {
      if (a === b) continue;
      const d = Math.hypot(a.x - b.x, pinHeadCentre(a.y, a.radius) - pinHeadCentre(b.y, b.radius));
      assert.ok(d >= a.radius + b.radius, "two pin heads do not overlap");
    }
    assert.ok(a.x - a.radius >= 0 && a.x + a.radius <= 1080, "inside the image width");
  }
  assert.equal("routes" in layout, false, "no connecting lines");
  const empty = layoutWorldMap([], FRAME);
  assert.deepEqual([empty.pins, empty.unpinned], [[], []]);
});

test("a region full of photos cannot use up every pin (geographic spread first)", () => {
  // 40 places all in the northeast USA with the most photos, plus 4 places elsewhere with few photos.
  const crowded = Array.from({ length: 40 }, (_, i) => ({
    latitude: 38 + (i % 8) * 0.9, longitude: -84 + Math.floor(i / 8) * 2.2, count: 100 - i, photoId: `ne${i}`, firstAt: null,
  }));
  const far = [[-22.9, -43.2], [48.85, 2.35], [35.7, 139.7], [25.2, 55.3]].map(([latitude, longitude], i) => ({
    latitude: latitude!, longitude: longitude!, count: 3, photoId: `far${i}`, firstAt: null,
  }));
  const layout = layoutWorldMap([...crowded, ...far], FRAME, { skyAllowance: 70 });
  for (const f of far) assert.ok(layout.pins.some((p) => p.cluster.photoId === f.photoId), `${f.photoId} still gets a pin`);
});

test("the renderer draws no routes or planes, and the map is the flat panel", () => {
  const renderer = read("src/lib/share-journey/render-journey-image.ts");
  assert.doesNotMatch(renderer, /drawPlane|setLineDash|routes|greatCircle|drawGlobe|createRadialGradient\(item\.x/);
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


// ---- map regions: Mundo / Estados Unidos / Brasil ----------------------------------------------------

/** Test-only trips: some in the USA, some in Brazil, some elsewhere. Albums double as GPS photo owners. */
const REGION_TRIPS: readonly (readonly [string, string, string, number, number, number])[] = [
  // title, country, album, lat, lon, photos
  ["New York, NY", "US", "ny", 40.71, -74.0, 50],
  ["Boston, MA", "US", "bos", 42.36, -71.06, 10],
  ["Miami, FL", "US", "mia", 25.76, -80.19, 5],
  ["Austin, TX", "US", "tx", 30.27, -97.74, 8],
  ["Las Vegas, NV", "US", "lv", 36.17, -115.14, 7],
  ["Honolulu, HI", "US", "hi", 21.31, -157.86, 6],
  ["Anchorage, AK", "US", "ak", 61.2, -149.9, 3],
  ["Rio de Janeiro, Brasil", "BR", "rio", -22.9, -43.2, 30],
  ["Salvador, Brasil", "BR", "sal", -12.97, -38.5, 9],
  ["Bali, Indonésia", "ID", "bali", -8.65, 115.2, 20],
  ["Dubai, Emirados Árabes Unidos", "AE", "dxb", 25.2, 55.27, 15],
];
const regionPlaces: OwnerPlaceCardItem[] = REGION_TRIPS.map(([title, countryCode, albumId, , , photoCount]) => ({
  albumId, experienceId: albumId, experienceSlug: albumId, experienceTitle: title, title, countryCode,
  startsAt: "2024-03-01T00:00:00Z", endsAt: "2024-03-05T00:00:00Z", coverPhotoId: `cover-${albumId}`, coverFocus: null, previewPhotoIds: [], photoCount,
}));
const regionPoints: JourneyPoint[] = REGION_TRIPS.flatMap(([, , albumId, lat, lon, n]) =>
  Array.from({ length: n }, (_, k) => ({ photoId: `${albumId}-${k}`, albumId, latitude: lat + (k % 3) * 0.01, longitude: lon + (k % 2) * 0.01, capturedAt: "2024-03-02T10:00:00Z" })),
);
// Photos without an album (e.g. loose GPS photos) belong to no country trip.
regionPoints.push({ photoId: "loose-us", albumId: null, latitude: 34.05, longitude: -118.24, capturedAt: null });
const buildRegion = (region: JourneyRegion, selected: string[] = []) =>
  buildJourneySummary({ region, places: regionPlaces, displayName: "x", bio: null, countryCodes: ["US", "BR", "ID", "AE"], selectedAlbumIds: selected, points: regionPoints });

test("the three maps are offered: Mundo, Estados Unidos, Brasil", () => {
  assert.deepEqual(JOURNEY_REGIONS.map((r) => [r.id, r.title]), [["world", "Mundo"], ["us", "Estados Unidos"], ["br", "Brasil"]]);
  assert.equal(JOURNEY_REGIONS[0]!.description, "Veja sua jornada pelo mundo inteiro");
});

test("Mundo lists every trip; EUA only US trips; Brasil only Brazil trips", () => {
  assert.equal(tripsForRegion(regionPlaces, "world").length, regionPlaces.length);
  assert.deepEqual(tripsForRegion(regionPlaces, "us").map((t) => t.albumId), ["ny", "bos", "mia", "tx", "lv", "hi", "ak"]);
  assert.deepEqual(tripsForRegion(regionPlaces, "br").map((t) => t.albumId), ["rio", "sal"]);
});

test("a trip outside the chosen region cannot be selected; the limit of 5 still holds", () => {
  const us = tripsForRegion(regionPlaces, "us");
  assert.deepEqual(toggleRegionTrip([], "bali", us, MAX_FAVORITE_TRIPS), [], "Bali is not a US trip");
  assert.deepEqual(toggleRegionTrip(["ny"], "rio", us, MAX_FAVORITE_TRIPS), ["ny"]);
  let selected: string[] = [];
  for (const trip of us) selected = toggleRegionTrip(selected, trip.albumId, us, MAX_FAVORITE_TRIPS);
  assert.equal(selected.length, MAX_FAVORITE_TRIPS, "7 US trips, only 5 accepted");
  assert.deepEqual(toggleRegionTrip(selected, "ny", us, MAX_FAVORITE_TRIPS).length, 4, "still removable");
  // Even if a stale id from another map reaches the summary, it never becomes a card.
  assert.deepEqual(buildRegion("us", ["bali", "ny", "rio"]).favorites.map((f) => f.albumId), ["ny"]);
});

test("the map is fed only by the GPS photos of the region's trips", () => {
  assert.equal(pointsForRegion(regionPoints, regionPlaces, "world").length, regionPoints.length);
  const us = pointsForRegion(regionPoints, regionPlaces, "us");
  assert.equal(us.length, 50 + 10 + 5 + 8 + 7 + 6 + 3, "all US trip photos, nothing else");
  assert.ok(us.every((p) => p.albumId !== null && ["ny", "bos", "mia", "tx", "lv", "hi", "ak"].includes(p.albumId)));
  const br = buildRegion("br");
  assert.equal(br.gpsPhotoCount, 39);
  assert.ok(br.clusters.every((c) => c.latitude < 0 && c.longitude < -30 && c.longitude > -75), "only Brazilian places");
  const usSummary = buildRegion("us");
  assert.ok(usSummary.clusters.every((c) => c.longitude < -60), "no Bali/Dubai/Rio on the US map");
  assert.equal(buildRegion("world").gpsPhotoCount, regionPoints.length);
});

test("stats follow the chosen map (not the whole account)", () => {
  const world = buildRegion("world").stats;
  const us = buildRegion("us").stats;
  const br = buildRegion("br").stats;
  assert.equal(world.trips, 11);
  assert.equal(us.trips, 7);
  assert.equal(us.countries, 1);
  assert.equal(us.states, 7);
  assert.equal(us.photos, 7 * 0 + 50 + 10 + 5 + 8 + 7 + 6 + 3);
  assert.equal(br.trips, 2);
  assert.equal(br.photos, 39);
  assert.ok(us.trips < world.trips && br.photos < world.photos);
  assert.deepEqual(statColumns("world", world).map((c) => c.label), ["Viagens", "Países", "Cidades", "Fotos"]);
  assert.deepEqual(statColumns("us", us).map((c) => c.label), ["Viagens", "Estados", "Cidades", "Fotos"]);
  assert.equal(statColumns("br", br).length, 3, "no country column inside one country");
  assert.deepEqual(statColumns("br", br).map((c) => c.kind), ["trip", "city", "photo"]);
  assert.equal(buildRegion("us").countryCodes.join(), "US", "only the region's flag");
  assert.equal(buildRegion("world").countryCodes.length, 4);
});

test("a region without trips says so and has nothing to generate from", () => {
  const onlyBali = regionPlaces.filter((p) => p.albumId === "bali");
  assert.deepEqual(tripsForRegion(onlyBali, "br"), []);
  assert.equal(NO_TRIPS_IN_REGION_MESSAGE, "Você ainda não tem viagens suficientes nessa região.");
  const section = read("src/app/perfil/share-journey-section.tsx");
  assert.match(section, /NO_TRIPS_IN_REGION_MESSAGE/);
  assert.match(section, /disabled=\{!hasTrips\}/);
});

test("the flow is: map → trips → generate → preview", () => {
  const section = read("src/app/perfil/share-journey-section.tsx");
  assert.match(section, /Escolha seu resumo/);
  assert.match(section, /Escolha suas viagens favoritas/);
  assert.match(section, /Selecione até 5 viagens para aparecerem no seu resumo/);
  assert.match(section, /setStep\("region"\)/);
  assert.match(section, /region,\s*places,/, "the region is passed to the summary");
  assert.match(section, /regionTrips\.map/, "only the region's trips are listed");
  assert.match(section, /setSelected\(\[\]\)/, "switching map clears the selection");
});

test("every pin has exactly the same size, whatever the photo count", () => {
  for (const region of ["world", "us", "br"] as const) {
    const summary = buildRegion(region);
    const layout = layoutMapViews(summary.clusters, regionMap(region).views, { skyAllowance: 70 });
    assert.ok(layout.pins.length >= (region === "br" ? 2 : 3), `${region} has pins`);
    assert.equal(new Set(layout.pins.map((p) => p.radius)).size, 1, `${region}: one radius`);
    assert.ok(layout.pins.every((p) => p.radius === layout.pinRadius));
    // 50 photos in New York and 3 in Anchorage → same size.
    assert.ok(new Set(layout.pins.map((p) => p.cluster.count)).size >= 2 || region === "br", "counts differ, sizes do not");
  }
  // And with a crowd that forces the smallest size, still one size.
  const crowded = layoutWorldMap(SPREAD.clusters, FRAME, { skyAllowance: 70 });
  assert.equal(new Set(crowded.pins.map((p) => p.radius)).size, 1);
  const renderer = read("src/lib/share-journey/render-journey-image.ts");
  assert.match(renderer, /drawPin\(ctx, pin\.x, pin\.y, [^;]*layout\.pinRadius\)/, "the renderer uses the layout's single size");
});

test("country maps show their own region and keep pins apart (Hawaii and Alaska on the US map)", () => {
  const us = buildRegion("us");
  const map = regionMap("us");
  const layout = layoutMapViews(us.clusters, map.views, { skyAllowance: 70 });
  const has = (lat: number, lon: number) => layout.pins.some((p) => Math.abs(p.cluster.latitude - lat) < 1 && Math.abs(p.cluster.longitude - lon) < 1);
  for (const [lat, lon] of [[40.71, -74.0], [25.76, -80.19], [30.27, -97.74], [36.17, -115.14], [21.31, -157.86], [61.2, -149.9]] as const) assert.ok(has(lat, lon), `${lat},${lon} pinned`);
  for (const a of layout.pins) for (const b of layout.pins) {
    if (a !== b) assert.ok(Math.hypot(a.x - b.x, pinHeadCentre(a.y, a.radius) - pinHeadCentre(b.y, b.radius)) >= a.radius + b.radius, "no overlap");
  }
  const br = layoutMapViews(buildRegion("br").clusters, regionMap("br").views, { skyAllowance: 70 });
  assert.equal(br.pins.length, 2, "Rio and Salvador");
  assert.ok(br.pins.every((p) => p.x > 0 && p.x < 1080));
});

test("generation still works for each map: summary, pins and photo list are consistent", () => {
  for (const region of ["world", "us", "br"] as const) {
    const summary = buildRegion(region, tripsForRegion(regionPlaces, region).slice(0, 3).map((t) => t.albumId));
    assert.equal(summary.favorites.length, Math.min(3, tripsForRegion(regionPlaces, region).length));
    assert.equal(summary.region, region);
  }
  const generator = read("src/lib/share-journey/generate-journey-image.ts");
  assert.match(generator, /summary\.region === "world"/, "region outlines are only loaded for country maps");
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CITY_TIER_MIN_ZOOM,
  COUNTRY_NAMES_FADE,
  COUNTRY_TIER_MIN_ZOOM,
  GEO_DATA_VERSION,
  LAND_PALETTE,
  REGION_TIER_MIN_ZOOM,
  buildGlobeLabelLayers,
  buildGlobeLandLayers,
  createCityDotImage,
} from "./globe-labels";

const PUBLIC = path.resolve(__dirname, "../../../public");
const GLOBE_MAX_ZOOM = 7;

test("tiers appear at increasing zooms, so the globe fills up gradually", () => {
  for (const table of [COUNTRY_TIER_MIN_ZOOM, CITY_TIER_MIN_ZOOM]) {
    assert.ok(table[1] < table[2] && table[2] < table[3] && table[3] < table[4]);
  }
  assert.ok(REGION_TIER_MIN_ZOOM[1] < REGION_TIER_MIN_ZOOM[2]);
  // Whole planet: only the biggest countries. No city names yet.
  assert.ok(COUNTRY_TIER_MIN_ZOOM[1] < 1.5);
  assert.ok(CITY_TIER_MIN_ZOOM[1] > 2);
  // Regions only once a country fills the view.
  assert.ok(REGION_TIER_MIN_ZOOM[1] >= 3.5);
  // Country names are gone before the zoom limit; the last tiers still fit under it.
  assert.ok(COUNTRY_NAMES_FADE[1] < GLOBE_MAX_ZOOM);
  assert.ok(CITY_TIER_MIN_ZOOM[4] < GLOBE_MAX_ZOOM);
  assert.ok(REGION_TIER_MIN_ZOOM[2] < GLOBE_MAX_ZOOM);
});

test("label layers: unique ids, known sources, nothing that could crowd or draw roads", () => {
  const layers = buildGlobeLabelLayers();
  const ids = layers.map((layer) => layer.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const layer of layers) {
    assert.ok(
      "source" in layer && (layer.source === "globe-borders" || layer.source === "globe-places"),
      `${layer.id} uses an unexpected source`,
    );
    if (layer.type === "symbol") {
      assert.notEqual(layer.layout?.["text-allow-overlap"], true, `${layer.id} allows overlap`);
      assert.notEqual(layer.layout?.["icon-allow-overlap"], true, `${layer.id} allows overlap`);
      assert.equal(typeof layer.minzoom, "number", `${layer.id} needs a min zoom`);
    }
  }
  // Borders first (bottom), then regions, countries, cities (cities win collisions).
  const order = (prefix: string) => ids.findIndex((id) => id.startsWith(prefix));
  assert.equal(ids[0], "globe-borders");
  assert.ok(order("globe-regions") < order("globe-countries"));
  assert.ok(order("globe-countries") < order("globe-cities"));
  // Within a kind, the most important tier is on top.
  assert.ok(ids.indexOf("globe-cities-t4") < ids.indexOf("globe-cities-t1"));
});

test("every font the labels ask for is shipped with the app", () => {
  const stacks = new Set<string>();
  for (const layer of buildGlobeLabelLayers()) {
    const fonts = (layer.layout as Record<string, unknown> | undefined)?.["text-font"];
    if (Array.isArray(fonts)) for (const font of fonts) stacks.add(String(font));
  }
  assert.ok(stacks.size > 0);
  for (const stack of stacks) {
    assert.ok(
      existsSync(path.join(PUBLIC, "fonts", stack, "0-255.pbf")),
      `public/fonts/${stack}/0-255.pbf is missing`,
    );
  }
});

test("the city dot is a small, centred, opaque-cored image", () => {
  const { width, height, data } = createCityDotImage(24);
  assert.equal(data.length, width * height * 4);
  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3]!;
  assert.equal(alphaAt(12, 12), 255);
  assert.equal(alphaAt(0, 0), 0);
  assert.equal(alphaAt(23, 23), 0);
});

interface Place {
  readonly k: "country" | "city" | "region";
  readonly n: string;
  readonly t: number;
  readonly s: number;
  readonly lng: number;
  readonly lat: number;
}

function loadPlaces(): Place[] {
  const file = path.join(PUBLIC, "geo", `places-${GEO_DATA_VERSION}.json`);
  const json = JSON.parse(readFileSync(file, "utf8")) as {
    features: { properties: Omit<Place, "lng" | "lat">; geometry: { coordinates: [number, number] } }[];
  };
  return json.features.map((feature) => ({
    ...feature.properties,
    lng: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
  }));
}

test("places data: well formed, Portuguese, and light enough for a globe", () => {
  const places = loadPlaces();
  for (const place of places) {
    assert.ok(["country", "city", "region"].includes(place.k));
    assert.ok(place.n.trim().length > 1, "empty name");
    assert.ok(place.n.length <= 36, `${place.n} is too long for a label`);
    assert.ok([...place.n].every((ch) => ch.codePointAt(0)! < 256), `${place.n} has glyphs outside the font`);
    assert.ok(place.lng >= -180 && place.lng <= 180 && place.lat >= -90 && place.lat <= 90, place.n);
    assert.ok(place.t >= 1 && place.t <= 4);
  }
  const by = (k: Place["k"], t?: number) => places.filter((p) => p.k === k && (t === undefined || p.t === t));

  // Few names at the first zoom levels.
  assert.ok(by("country", 1).length <= 25);
  assert.ok(by("city", 1).length <= 45);
  assert.ok(by("country").length >= 180, "countries are missing");
  assert.ok(by("city").length >= 300, "cities are missing");

  // No duplicate country names.
  const names = by("country").map((p) => p.n);
  assert.equal(new Set(names).size, names.length);

  const has = (k: Place["k"], name: string) => by(k).some((p) => p.n === name);
  for (const name of ["Brasil", "Estados Unidos", "Alemanha", "Reino Unido", "Japão", "Itália", "Espanha", "Índia", "Tchéquia", "Irã", "Coreia do Sul"]) {
    assert.ok(has("country", name), `country ${name}`);
  }
  for (const name of ["São Paulo", "Rio de Janeiro", "Tóquio", "Nova York", "Londres", "Lisboa", "Roma", "Pequim", "Moscou", "Gramado", "Florianópolis", "Santorini"]) {
    assert.ok(has("city", name), `city ${name}`);
  }
});

test("regions exist for every country chosen for state/region names", () => {
  const regions = loadPlaces().filter((p) => p.k === "region");
  const near = (lat: number, lng: number, name: string) =>
    regions.some((r) => r.n === name && Math.abs(r.lat - lat) < 8 && Math.abs(r.lng - lng) < 10);
  // One well-known region per country (Brazil, US, Canada, Australia, Mexico,
  // Argentina, France, Italy, Spain, Germany, Portugal, UK, Indonesia, Japan, China, India).
  assert.ok(near(-22, -43, "Rio de Janeiro"));
  assert.ok(near(37, -119, "Califórnia"));
  assert.ok(near(52, -120, "Colúmbia Britânica"));
  assert.ok(near(-32, 147, "Nova Gales do Sul"));
  assert.ok(near(20, -99, "Cidade do México"));
  assert.ok(near(-41, -66, "Rio Negro"));
  assert.ok(near(48, 2, "Ilha de França"));
  assert.ok(near(43, 11, "Toscana"));
  assert.ok(near(37, -4, "Andaluzia"));
  assert.ok(near(48, 11, "Baviera"));
  assert.ok(near(39, -9, "Lisboa"));
  assert.ok(near(55, -4, "Escócia"));
  assert.ok(near(-8, 115, "Bali"));
  assert.ok(near(35, 135, "Quioto"));
  assert.ok(near(30, 104, "Sichuan"));
  assert.ok(near(15, 74, "Goa"));
  // Brazil has all 27 states; the US its 50.
  assert.ok(regions.filter((r) => r.lng < -30 && r.lng > -75 && r.lat < 6 && r.lat > -34).length >= 27);
  assert.ok(regions.filter((r) => r.lng < -66 && r.lng > -170 && r.lat > 17).length >= 50);
});

test("borders data: land borders only, as one multi-line", () => {
  const file = path.join(PUBLIC, "geo", `borders-${GEO_DATA_VERSION}.json`);
  const json = JSON.parse(readFileSync(file, "utf8")) as {
    features: { geometry: { type: string; coordinates: number[][][] } }[];
  };
  assert.equal(json.features.length, 1);
  assert.equal(json.features[0]!.geometry.type, "MultiLineString");
  const lines = json.features[0]!.geometry.coordinates;
  assert.ok(lines.length > 100 && lines.length < 5000);
  for (const line of lines) assert.ok(line.length >= 2);
  // Sanity: a border crossing the US/Mexico line exists near (−110, 31.3).
  const nearMexico = lines.some((line) => line.some(([lng, lat]) => Math.abs(lng! + 110) < 2 && Math.abs(lat! - 31.3) < 1.2));
  assert.ok(nearMexico);
});

test("land layers: a blue ocean and flat country fills, nothing photographic", () => {
  const layers = buildGlobeLandLayers();
  assert.deepEqual(
    layers.map((layer) => layer.type),
    ["background", "fill"],
  );
  assert.equal(LAND_PALETTE.length, 7, "6 land colours + ice");
  const fill = layers[1] as { paint: { "fill-color": unknown[] } };
  const expression = fill.paint["fill-color"];
  assert.equal(expression[0], "match");
  // Every colour index the data can use resolves to a palette colour.
  for (let index = 0; index < LAND_PALETTE.length; index += 1) {
    assert.ok(expression.includes(index), `colour ${index} is not mapped`);
    assert.ok(expression.includes(LAND_PALETTE[index]));
  }
});

type Ring = number[][];
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };

function inRing(ring: Ring, lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > lat !== yj! > lat && lng < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

function inGeometry(geometry: Geometry, lng: number, lat: number): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(([outer, ...holes]) => inRing(outer!, lng, lat) && !holes.some((hole) => inRing(hole, lng, lat)));
}

test("land data: neighbouring countries never share a colour", () => {
  const file = path.join(PUBLIC, "geo", `countries-${GEO_DATA_VERSION}.json`);
  const json = JSON.parse(readFileSync(file, "utf8")) as {
    features: { properties: { c: number }; geometry: Geometry }[];
  };
  assert.ok(json.features.length >= 200);
  for (const feature of json.features) {
    assert.ok(Number.isInteger(feature.properties.c) && feature.properties.c >= 0 && feature.properties.c < LAND_PALETTE.length);
  }
  const colourAt = (lng: number, lat: number): number => {
    const found = json.features.find((feature) => inGeometry(feature.geometry, lng, lat));
    assert.ok(found, `no country at ${lng},${lat}`);
    return found.properties.c;
  };
  const brasil = colourAt(-52, -10);
  const argentina = colourAt(-64, -34);
  const peru = colourAt(-75, -10);
  const bolivia = colourAt(-64, -17);
  assert.notEqual(brasil, argentina);
  assert.notEqual(brasil, peru);
  assert.notEqual(brasil, bolivia);
  assert.notEqual(peru, bolivia);
  const [alemanha, franca, polonia, austria, suica] = [
    colourAt(10.5, 51), colourAt(2.5, 46.5), colourAt(19, 52), colourAt(14.5, 47.5), colourAt(8.2, 46.8),
  ];
  for (const other of [franca, polonia, austria, suica]) assert.notEqual(alemanha, other);
  assert.notEqual(colourAt(-98, 39), colourAt(-100, 60)); // Estados Unidos / Canadá
  assert.notEqual(colourAt(-98, 39), colourAt(-102, 23)); // Estados Unidos / México
  assert.notEqual(colourAt(78, 22), colourAt(103, 35)); // Índia / China
  assert.notEqual(colourAt(78, 22), colourAt(70, 30)); // Índia / Paquistão
  // Antarctica is ice, and the six land colours are all in use.
  const ice = json.features.filter((f) => f.properties.c === LAND_PALETTE.length - 1);
  assert.equal(ice.length, 1);
  assert.ok(JSON.stringify(ice[0]!.geometry.coordinates).includes(",-90"), "the ice is Antarctica");
  assert.ok(new Set(json.features.map((f) => f.properties.c)).size >= 6);
});

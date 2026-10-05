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
  buildGlobeReliefLayers,
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

test("land layers: a blue ocean and flat natural land colours, nothing photographic", () => {
  const layers = buildGlobeLandLayers();
  assert.deepEqual(
    layers.map((layer) => layer.type),
    ["background", "fill"],
  );
  assert.equal(LAND_PALETTE.length, 11, "one colour per climate group");
  const fill = layers[1] as { paint: { "fill-color": unknown[] } };
  const expression = fill.paint["fill-color"];
  assert.equal(expression[0], "match");
  assert.deepEqual(expression[1], ["get", "t"]);
  // Every climate group the data can use resolves to a palette colour.
  for (let index = 0; index < LAND_PALETTE.length; index += 1) {
    assert.ok(expression.includes(index), `group ${index} is not mapped`);
    assert.ok(expression.includes(LAND_PALETTE[index]));
  }
});

test("land colours are natural: greens, sands, greys — no rainbow of countries", () => {
  const hue = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return { hue: 0, saturation: 0 };
    const d = max - min;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { hue: (h * 60 + 360) % 360, saturation: d / max };
  };
  for (const color of LAND_PALETTE) {
    const { hue: h, saturation } = hue(color);
    // Yellows/oranges/greens only (30°–160°), or near-neutral (ice, tundra).
    assert.ok(saturation < 0.2 || (h >= 30 && h <= 160), `${color} (hue ${h.toFixed(0)}) is not a natural land colour`);
  }
});

test("relief layers: soft ridge lines from the ranges data, a light and a shadow side", () => {
  const layers = buildGlobeReliefLayers();
  assert.deepEqual(layers.map((layer) => layer.id), ["globe-relief-shadow", "globe-relief-light"]);
  for (const layer of layers) {
    assert.equal(layer.type, "line");
    assert.equal((layer as { source: string }).source, "globe-ranges");
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

test("land data: climate groups follow real geography and stop at the coastline", () => {
  const file = path.join(PUBLIC, "geo", `land-${GEO_DATA_VERSION}.json`);
  const json = JSON.parse(readFileSync(file, "utf8")) as {
    features: { properties: { t: number }; geometry: Geometry }[];
  };
  const groups = json.features.map((feature) => feature.properties.t).sort((a, b) => a - b);
  assert.deepEqual(groups, [...LAND_PALETTE.keys()], "every group appears exactly once");

  const groupAt = (lng: number, lat: number): number | null => {
    const found = json.features.find((feature) => inGeometry(feature.geometry, lng, lat));
    return found ? found.properties.t : null;
  };
  // Land: 0 rainforest · 1 savanna · 2 hot desert · 3 cold desert · 4 steppe · 6 temperate
  // · 7 continental · 8 taiga · 9 tundra · 10 ice
  assert.equal(groupAt(-62, -4), 0, "Amazon");
  assert.equal(groupAt(23, 0), 0, "Congo");
  assert.equal(groupAt(20, 25), 2, "Sahara");
  assert.equal(groupAt(45, 24), 2, "Arabian desert");
  assert.equal(groupAt(105, 42), 3, "Gobi");
  assert.equal(groupAt(100, 62), 8, "Siberian taiga");
  assert.equal(groupAt(-45, 75), 10, "Greenland ice");
  assert.equal(groupAt(2.3, 48.8), 6, "Paris");
  assert.equal(groupAt(-46.6, -23.5), 6, "São Paulo");
  // Open sea has no land cover at all.
  assert.equal(groupAt(-30, 0), null, "mid-Atlantic");
  assert.equal(groupAt(80, -30), null, "Indian Ocean");
});

test("ranges data: ridge lines of the great mountain ranges", () => {
  const file = path.join(PUBLIC, "geo", `ranges-${GEO_DATA_VERSION}.json`);
  const json = JSON.parse(readFileSync(file, "utf8")) as {
    features: { properties: { n: string }; geometry: { type: string; coordinates: number[][] } }[];
  };
  const names = json.features.map((feature) => feature.properties.n);
  for (const name of ["Andes", "Rockies", "Alps", "Himalaya"]) assert.ok(names.includes(name), name);
  for (const feature of json.features) {
    assert.equal(feature.geometry.type, "LineString");
    assert.ok(feature.geometry.coordinates.length >= 3);
    for (const [lng, lat] of feature.geometry.coordinates) {
      assert.ok(lng! >= -180 && lng! <= 180 && lat! >= -90 && lat! <= 90);
    }
  }
});

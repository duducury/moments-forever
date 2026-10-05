/**
 * Builds the static geography the immersive globe is drawn from: the land
 * (flat, colourful countries), country borders, plus country / city / region
 * name labels in Portuguese. Output (committed, served from our own domain — no map service,
 * no API, nothing fetched in production):
 *
 *   public/geo/land-v1.json      The land as natural cover: climate regions (rainforest,
 *                                savanna, desert, steppe, forest, taiga, tundra, ice)
 *                                clipped to the real coastline; property t = climate group
 *   public/geo/ranges-v1.json    Ridge lines of the main mountain ranges (soft relief)
 *   public/geo/borders-v1.json   MultiLineString of land borders between countries
 *   public/geo/places-v1.json    Point features: countries, cities, regions
 *
 * Sources (all local npm packages, only needed when regenerating):
 *   - world-atlas            Natural Earth 1:50m countries (public domain)
 *   - koppen-climate-lookup  Köppen–Geiger climate classes, 0.5° (Kottek et al. 2006; Rubel et al. 2017)
 *   - d3-contour, clipper-lib  trace climate regions and clip them to the coastline
 *   - i18n-iso-countries     Portuguese country names (MIT)
 *   - all-the-cities         GeoNames cities (CC BY 4.0 — credited in the map attribution)
 *   - country-state-city     state / region centroids
 *   - d3-geo, polylabel, topojson-client  geometry helpers
 *
 * Regenerate (none of these are app dependencies, so nothing touches package.json):
 *   mkdir /tmp/geo && cd /tmp/geo && npm init -y && npm i world-atlas topojson-client \
 *     i18n-iso-countries all-the-cities country-state-city d3-geo polylabel \
 *     koppen-climate-lookup d3-contour clipper-lib
 *   GEO_DEPS_DIR=/tmp/geo node apps/web/scripts/build-globe-geo.mjs
 *
 * Every place has:  k kind · n name · t tier (1 = most important, shown first)
 *                   s sort key (lower wins a label collision)
 * The app decides at which zoom each tier appears (see globe-labels.ts).
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "../public/geo");
const depsDir = process.env.GEO_DEPS_DIR ?? process.cwd();
const require = createRequire(path.join(depsDir, "package.json"));

const topojson = require("topojson-client");
const { geoArea, geoEquirectangular, geoPath } = require("d3-geo");
const ClipperLib = require("clipper-lib");
const { KoppenLookup } = require("koppen-climate-lookup");
const { contours } = await import(pathToFileURL(require.resolve("d3-contour")).href);
const polylabelModule = require("polylabel");
const polylabel = polylabelModule.default ?? polylabelModule;
const countriesNames = require("i18n-iso-countries");
countriesNames.registerLocale(require("i18n-iso-countries/langs/pt.json"));
const allCities = require("all-the-cities");
const { State } = require("country-state-city");
const atlas = JSON.parse(
  readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"),
);

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Only characters the self-hosted font file covers (Latin-1: every Portuguese,
 * Spanish, French, German... accent). A rarer letter loses its mark ("İzmir" →
 * "Izmir", "Łódź" → "Lodz"); anything still outside is dropped.
 */
function clean(text) {
  const normalized = text
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
  const fits = (value) => [...value].every((ch) => ch.codePointAt(0) < 256);
  if (fits(normalized)) return normalized;
  const folded = normalized
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
  return fits(folded) ? folded : null;
}

// --- Borders: land borders only (no coastline: the land fills already have one) ----------

const borders = topojson.mesh(atlas, atlas.objects.countries, (a, b) => a !== b);
const bordersJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiLineString",
        coordinates: borders.coordinates
          .map((line) => {
            const out = [];
            for (const [lng, lat] of line) {
              const p = [round(lng, 2), round(lat, 2)];
              const last = out[out.length - 1];
              if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
            }
            return out;
          })
          .filter((line) => line.length > 1),
      },
    },
  ],
};

// --- Land: natural cover (Köppen–Geiger climate) clipped to the real coastline ------------------

/**
 * Climate groups, in the order of LAND_PALETTE in src/lib/map/globe-labels.ts.
 * Köppen–Geiger (Kottek et al. 2006; Rubel et al. 2017) at 0.5°, from the
 * koppen-climate-lookup package: rainforest and savanna read as greens, the dry
 * classes as sand, the cold ones as dark taiga, tundra and ice.
 */
const CLIMATE_GROUPS = [
  ["Af"], // 0 rainforest
  ["Am", "As", "Aw"], // 1 savanna
  ["BWh"], // 2 hot desert
  ["BWk"], // 3 cold desert
  ["BSh", "BSk"], // 4 steppe
  ["Csa", "Csb", "Csc"], // 5 mediterranean
  ["Cfa", "Cfb", "Cfc", "Cwa", "Cwb", "Cwc"], // 6 temperate
  ["Dfa", "Dfb", "Dsa", "Dsb", "Dwa", "Dwb"], // 7 continental
  ["Dfc", "Dfd", "Dsc", "Dsd", "Dwc", "Dwd"], // 8 boreal forest (taiga)
  ["ET"], // 9 tundra
  ["EF"], // 10 ice
];
const groupOfClass = new Map();
CLIMATE_GROUPS.forEach((classes, group) => classes.forEach((c) => groupOfClass.set(c, group)));

/**
 * Natural Earth's polygons are spherical: Russia (Chukotka), Fiji and
 * Antarctica cross the antimeridian with a ring edge that jumps from +180° to
 * −180°. Drawn on a flat lng/lat plane (as MapLibre does) that edge becomes a
 * band across the whole world. d3's equirectangular projection cuts such
 * polygons properly along ±180°; its path comes back as x = lng, y = −lat.
 */
const equirectangular = geoEquirectangular().scale(180 / Math.PI).translate([0, 0]).precision(0);
const toPath = geoPath(equirectangular).digits(2);
function hasAntimeridianJump(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) =>
    polygon.some((ring) => ring.some((point, i) => i > 0 && Math.abs(point[0] - ring[i - 1][0]) > 180)),
  );
}
function cutAtAntimeridian(feature) {
  const rings = toPath(feature)
    .split("M")
    .filter(Boolean)
    .map((subpath) => {
      const numbers = subpath.replace(/Z/g, "").split(/[ ,L]+/).filter(Boolean).map(Number);
      const ring = [];
      for (let i = 0; i < numbers.length; i += 2) ring.push([round(numbers[i], 2), round(-numbers[i + 1], 2)]);
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
      return ring;
    });
  return { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) };
}

/** Every land polygon (countries), cut at the antimeridian, as lists of rings [outer, ...holes]. */
const landPolygons = [];
for (const feature of topojson.feature(atlas, atlas.objects.countries).features) {
  const geometry = hasAntimeridianJump(feature.geometry) ? cutAtAntimeridian(feature) : feature.geometry;
  if (geometry.type === "Polygon") landPolygons.push(geometry.coordinates);
  else for (const polygon of geometry.coordinates) landPolygons.push(polygon);
}

// 1. The climate raster, 0.5°: group index per land cell, −1 for sea.
const GRID_W = 720;
const GRID_H = 360;
const labels = new Int8Array(GRID_W * GRID_H).fill(-1);
for (const [, value] of KoppenLookup.getInstance().grid) {
  const group = groupOfClass.get(value.koppenClass);
  if (group === undefined) throw new Error(`Unknown Köppen class ${value.koppenClass}`);
  const x = Math.floor((value.longitude + 180) / 0.5);
  const y = Math.floor((90 - value.latitude) / 0.5);
  if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) labels[y * GRID_W + x] = group;
}

// 2. Spread the climate over the sea (nearest land cell wins), so every coast and
//    island gets one once it is clipped to the real coastline.
{
  const queue = [];
  for (let i = 0; i < labels.length; i += 1) if (labels[i] >= 0) queue.push(i);
  for (let head = 0; head < queue.length; head += 1) {
    const i = queue[head];
    const x = i % GRID_W;
    const y = (i - x) / GRID_W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = (x + dx + GRID_W) % GRID_W;
      const ny = y + dy;
      if (ny < 0 || ny >= GRID_H) continue;
      const j = ny * GRID_W + nx;
      if (labels[j] === -1) {
        labels[j] = labels[i];
        queue.push(j);
      }
    }
  }
}

// 3. Soften: blur each group's indicator, upsample 2×, keep the strongest group per
//    pixel. This gives organic region edges instead of 0.5° blocks, and neighbouring
//    groups share their boundary exactly (no gaps, no overlaps).
const UP = 2;
const OUT_W = GRID_W * UP;
const OUT_H = GRID_H * UP;
const KERNEL = [0.06, 0.24, 0.4, 0.24, 0.06]; // σ ≈ 1 cell
function blurredIndicator(group) {
  const base = new Float32Array(GRID_W * GRID_H);
  for (let i = 0; i < base.length; i += 1) base[i] = labels[i] === group ? 1 : 0;
  const horizontal = new Float32Array(base.length);
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      let sum = 0;
      for (let k = -2; k <= 2; k += 1) sum += KERNEL[k + 2] * base[y * GRID_W + ((x + k + GRID_W) % GRID_W)];
      horizontal[y * GRID_W + x] = sum;
    }
  }
  const out = new Float32Array(base.length);
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      let sum = 0;
      for (let k = -2; k <= 2; k += 1) {
        const yy = Math.min(GRID_H - 1, Math.max(0, y + k));
        sum += KERNEL[k + 2] * horizontal[yy * GRID_W + x];
      }
      out[y * GRID_W + x] = sum;
    }
  }
  return out;
}
function sampleBilinear(field, fx, fy) {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x, y) => field[Math.min(GRID_H - 1, Math.max(0, y)) * GRID_W + ((x + GRID_W) % GRID_W)];
  return (
    at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) +
    at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty
  );
}
const fields = CLIMATE_GROUPS.map((_, group) => blurredIndicator(group));
const strongest = new Int8Array(OUT_W * OUT_H);
for (let y = 0; y < OUT_H; y += 1) {
  for (let x = 0; x < OUT_W; x += 1) {
    let best = 0;
    let bestValue = -1;
    for (let group = 0; group < fields.length; group += 1) {
      const value = sampleBilinear(fields[group], (x + 0.5) / UP - 0.5, (y + 0.5) / UP - 0.5);
      if (value > bestValue) {
        bestValue = value;
        best = group;
      }
    }
    strongest[y * OUT_W + x] = best;
  }
}

// 4. Trace each group as polygons, then clip them to the real land with Clipper.
const CLIP_SCALE = 1000;
/** Chaikin corner cutting: turns the pixel staircase of a traced region into a soft curve. */
function smoothRing(ring, rounds) {
  let points = ring.slice(0, -1);
  for (let round = 0; round < rounds; round += 1) {
    const next = [];
    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      next.push([0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2], [0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2]);
    }
    points = next;
  }
  return points;
}
const toClipper = (ring) => ring.map(([lng, lat]) => ({ X: Math.round(lng * CLIP_SCALE), Y: Math.round(lat * CLIP_SCALE) }));
const landPaths = landPolygons.flatMap((polygon) => polygon.map(toClipper));

const landFeatures = [];
for (let group = 0; group < CLIMATE_GROUPS.length; group += 1) {
  const mask = new Float32Array(OUT_W * OUT_H);
  for (let i = 0; i < mask.length; i += 1) mask[i] = strongest[i] === group ? 1 : 0;
  const traced = contours().size([OUT_W, OUT_H]).thresholds([0.5])(mask)[0];
  const regionPaths = [];
  for (const polygon of traced.coordinates) {
    for (const ring of polygon) {
      const geo = ring.map(([x, y]) => [-180 + (x + 0.5) / (UP * 2), 90 - (y + 0.5) / (UP * 2)]);
      regionPaths.push(toClipper(smoothRing(geo, 2)));
    }
  }
  if (regionPaths.length === 0) continue;

  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(landPaths, ClipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(regionPaths, ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  clipper.Execute(
    ClipperLib.ClipType.ctIntersection,
    tree,
    ClipperLib.PolyFillType.pftEvenOdd,
    ClipperLib.PolyFillType.pftEvenOdd,
  );
  const toRing = (path) => {
    const ring = path.map((p) => [round(p.X / CLIP_SCALE, 2), round(p.Y / CLIP_SCALE, 2)]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    return ring;
  };
  const polygons = [];
  const walk = (node) => {
    for (const child of node.Childs()) {
      if (!child.IsHole()) {
        const rings = [toRing(child.Contour())];
        for (const hole of child.Childs()) {
          rings.push(toRing(hole.Contour()));
          for (const island of hole.Childs()) walk({ Childs: () => [island] });
        }
        polygons.push(rings);
      }
    }
  };
  walk(tree);
  if (polygons.length === 0) continue;
  landFeatures.push({
    type: "Feature",
    properties: { t: group },
    geometry: { type: "MultiPolygon", coordinates: polygons },
  });
}
const landJson = { type: "FeatureCollection", features: landFeatures };

// --- Relief: the main mountain ranges, as soft ridge lines ---------------------------------

/** Ridge lines [lng, lat] of the great ranges, drawn blurred and embossed (see globe-labels.ts). */
const RANGES = {
  Andes: [[-77, 8], [-75.5, 3], [-78.5, -1.5], [-77.5, -9], [-73, -14], [-69, -18], [-68, -23], [-69.5, -30], [-70.5, -35], [-71.5, -40], [-72.5, -46], [-73.5, -51], [-71, -54]],
  Rockies: [[-142, 62], [-128, 58], [-120, 52], [-114, 49], [-110, 44], [-106, 39], [-106, 34], [-107, 31]],
  "Sierra Madre": [[-109, 31], [-106, 26], [-104, 22], [-103, 19]],
  "Sierra Nevada": [[-122, 48], [-121, 44], [-120, 39], [-118, 36]],
  Alaska: [[-152, 62], [-148, 63], [-142, 62]],
  Appalachians: [[-84, 35], [-80, 38], [-77, 41], [-72, 44], [-70, 46]],
  Alps: [[6, 44], [7, 46], [10, 46.5], [13, 47], [15, 47.5]],
  Pyrenees: [[-2, 43], [0, 42.7], [3, 42.5]],
  Carpathians: [[18, 49], [21, 49.5], [24, 48], [25.5, 46], [23, 45.5]],
  Caucasus: [[38, 44], [42, 43.2], [46, 42], [48.5, 41]],
  Urals: [[60, 68], [60, 60], [59, 55], [58, 51]],
  Scandinavia: [[6, 60], [9, 62], [13, 65], [16, 67.5], [20, 69]],
  Atlas: [[-9, 31], [-5, 32.5], [0, 34], [5, 35.5], [9, 36]],
  Ethiopia: [[37, 14], [38.5, 10], [40, 7]],
  Drakensberg: [[29, -26], [28.5, -29.5], [27.5, -31]],
  Zagros: [[44, 37], [47, 34], [50, 31], [54, 28]],
  Himalaya: [[70, 36], [74, 36], [77, 34.5], [80, 31], [84, 28.5], [88, 28], [92, 28], [96, 28.5]],
  "Tian Shan": [[72, 38], [76, 41], [80, 42], [85, 43], [90, 43.5]],
  Altai: [[86, 50], [90, 50.5], [97, 49.5]],
  Kunlun: [[78, 36], [85, 36], [92, 35.5], [98, 35]],
  "Western Ghats": [[73, 20], [74, 15], [76, 10], [77.5, 8.5]],
  "Great Dividing Range": [[145, -15], [146, -20], [150, -25], [151, -30], [150, -35], [147, -37]],
  Annamite: [[105, 19], [107, 15], [108, 12]],
  "Southern Alps": [[169, -43.5], [171.5, -43], [168, -45.5]],
  "Japan Alps": [[137, 35], [137.7, 36.5], [138.5, 37.5]],
};
const rangesJson = {
  type: "FeatureCollection",
  features: Object.entries(RANGES).map(([name, coordinates]) => ({
    type: "Feature",
    properties: { n: name },
    geometry: { type: "LineString", coordinates },
  })),
};

// --- Countries ------------------------------------------------------------------------------

/** Portuguese (Brazil) names where the library's are European, odd or too long. */
const COUNTRY_NAME_OVERRIDES = {
  CD: "RD Congo",
  CG: "Congo",
  CZ: "Tchéquia",
  MK: "Macedônia do Norte",
  VA: "Vaticano",
  MM: "Mianmar",
  PS: "Palestina",
  GB: "Reino Unido",
  US: "Estados Unidos",
  AE: "Emirados Árabes",
  BA: "Bósnia",
  CF: "Rep. Centro-Africana",
  DO: "Rep. Dominicana",
  GQ: "Guiné Equatorial",
  GW: "Guiné-Bissau",
  KN: "São Cristóvão e Névis",
  VC: "São Vicente e Granadinas",
  ST: "São Tomé e Príncipe",
  AG: "Antígua e Barbuda",
  TT: "Trinidad e Tobago",
  PG: "Papua-Nova Guiné",
  FK: "Ilhas Malvinas",
  TF: "Terras Austrais",
  SJ: "Svalbard",
  XK: "Kosovo",
};

/** The library's names follow European Portuguese; make them Brazilian ("Irão" → "Irã"). */
function toBrazilian(name) {
  return name
    .replace(/énia/g, "ênia")
    .replace(/ónia/g, "ônia")
    .replace(/Irão/g, "Irã")
    .replace(/Gronelândia/g, "Groenlândia")
    .replace(/Maurícia/g, "Maurício")
    .replace(/Bangladeche/g, "Bangladesh")
    .replace(/Sri Lanca/g, "Sri Lanka")
    .replace(/Seicheles/g, "Seychelles")
    .replace(/Koweit/g, "Kuwait")
    .replace(/Qatar/g, "Catar")
    .replace(/Faroé/g, "Faroe")
    .replace(/Iémen/g, "Iêmen")
    .replace(/Mónaco/g, "Mônaco")
    .replace(/Vietname/g, "Vietnã")
    .replace(/Maláui/g, "Malaui")
    .replace(/Benim/g, "Benin")
    .replace(/Djibouti/g, "Djibuti")
    .replace(/^Saint Pierre/, "St. Pierre")
    .replace(/ \(.*\)$/, "");
}

/** Label anchor overrides where the biggest polygon's centre sits somewhere odd. */
const COUNTRY_LABEL_POINTS = {
  US: [-98.5, 39.5],
  CA: [-102, 60],
  RU: [96, 61.5],
  CN: [103.5, 35.5],
  AU: [134, -25.5],
  ID: [114, -1.5],
  CL: [-71.2, -34.5],
  NO: [9, 61.5],
  FR: [2.4, 46.7],
  DK: [9.4, 56],
  NZ: [172.5, -41.5],
  JP: [138.5, 37.2],
  GR: [22.5, 39.3],
  PH: [122.5, 12.5],
  GL: [-41, 74],
  CD: [23.5, -2.8],
  KZ: [67.5, 48],
};

/** Not worth a name of their own on the globe. */
const SKIP_COUNTRIES = new Set(["AQ", "TF", "HM", "BV", "GS", "UM", "AX", "IO", "SH"]);

function largestPolygon(feature) {
  const g = feature.geometry;
  if (g.type === "Polygon") return g.coordinates;
  let best = g.coordinates[0];
  let bestArea = -1;
  for (const polygon of g.coordinates) {
    const area = geoArea({ type: "Polygon", coordinates: polygon });
    if (area > bestArea) {
      best = polygon;
      bestArea = area;
    }
  }
  return best;
}

const countryFeatures = topojson.feature(atlas, atlas.objects.countries).features;
const countries = [];
for (const feature of countryFeatures) {
  let alpha2 = feature.id ? countriesNames.numericToAlpha2(feature.id) : null;
  if (!alpha2 && feature.properties.name === "Kosovo") alpha2 = "XK";
  if (!alpha2 || SKIP_COUNTRIES.has(alpha2)) continue;
  const name = clean(toBrazilian(COUNTRY_NAME_OVERRIDES[alpha2] ?? countriesNames.getName(alpha2, "pt") ?? ""));
  if (!name) continue;
  const point = COUNTRY_LABEL_POINTS[alpha2] ?? polylabel(largestPolygon(feature), 0.5);
  countries.push({
    alpha2,
    name,
    area: geoArea(feature),
    lng: round(point[0], 2),
    lat: round(point[1], 2),
  });
}
countries.sort((a, b) => b.area - a.area);
// Two territories can share a name ("Austrália"): keep the bigger one only.
const seenNames = new Set();
const uniqueCountries = countries.filter((country) => {
  if (seenNames.has(country.name)) return false;
  seenNames.add(country.name);
  return true;
});
countries.length = 0;
countries.push(...uniqueCountries);
const countryTier = (index) => (index < 20 ? 1 : index < 70 ? 2 : index < 140 ? 3 : 4);

const places = [];
countries.forEach((country, index) => {
  places.push({
    k: "country",
    n: country.name,
    t: countryTier(index),
    s: index,
    lng: country.lng,
    lat: country.lat,
  });
});

// --- Cities ---------------------------------------------------------------------------------

/** [country, GeoNames name, Portuguese name, tier] — the world's headline cities. */
const CITY_LIST = [
  // tier 1: the biggest and best-known
  ["JP", "Tokyo", "Tóquio", 1],
  ["IN", "Delhi", "Délhi", 1],
  ["CN", "Shanghai", "Xangai", 1],
  ["BR", "São Paulo", null, 1],
  ["MX", "Mexico City", "Cidade do México", 1],
  ["EG", "Cairo", null, 1],
  ["IN", "Mumbai", null, 1],
  ["CN", "Beijing", "Pequim", 1],
  ["US", "New York City", "Nova York", 1],
  ["TR", "Istanbul", "Istambul", 1],
  ["RU", "Moscow", "Moscou", 1],
  ["GB", "London", "Londres", 1],
  ["FR", "Paris", null, 1],
  ["US", "Los Angeles", null, 1],
  ["AR", "Buenos Aires", null, 1],
  ["BR", "Rio de Janeiro", null, 1],
  ["NG", "Lagos", null, 1],
  ["ID", "Jakarta", "Jacarta", 1],
  ["TH", "Bangkok", null, 1],
  ["KR", "Seoul", "Seul", 1],
  ["SG", "Singapore", "Singapura", 1],
  ["AU", "Sydney", null, 1],
  ["AE", "Dubai", "Dubai", 1],
  ["ZA", "Cape Town", "Cidade do Cabo", 1],
  ["IT", "Rome", "Roma", 1],
  ["ES", "Madrid", "Madri", 1],
  ["DE", "Berlin", "Berlim", 1],
  ["CA", "Toronto", null, 1],
  ["PE", "Lima", null, 1],
  ["CO", "Bogotá", null, 1],
  ["CL", "Santiago", null, 1],
  ["ZA", "Johannesburg", "Joanesburgo", 1],
  ["KE", "Nairobi", "Nairóbi", 1],
  ["IR", "Tehran", "Teerã", 1],
  ["BR", "Brasília", null, 1],
  ["PT", "Lisbon", "Lisboa", 1],
  ["US", "Washington", "Washington", 1],
  // tier 2: major destinations and hubs
  ["IT", "Venice", "Veneza", 2],
  ["IT", "Florence", "Florença", 2],
  ["IT", "Milan", "Milão", 2],
  ["JP", "Kyoto", "Quioto", 2],
  ["JP", "Osaka", null, 2],
  ["PE", "Cusco", null, 2],
  ["MA", "Marrakesh", "Marrakech", 2],
  ["ES", "Barcelona", null, 2],
  ["NL", "Amsterdam", "Amsterdã", 2],
  ["CZ", "Prague", "Praga", 2],
  ["AT", "Vienna", "Viena", 2],
  ["HU", "Budapest", "Budapeste", 2],
  ["GR", "Athens", "Atenas", 2],
  ["US", "Las Vegas", null, 2],
  ["US", "San Francisco", "São Francisco", 2],
  ["US", "Miami", null, 2],
  ["US", "Orlando", null, 2],
  ["US", "Chicago", null, 2],
  ["MX", "Cancún", null, 2],
  ["CU", "Havana", "Havana", 2],
  ["BR", "Salvador", null, 2],
  ["BR", "Fortaleza", null, 2],
  ["BR", "Recife", null, 2],
  ["BR", "Florianópolis", null, 2],
  ["BR", "Manaus", null, 2],
  ["BR", "Belém", null, 2],
  ["BR", "Foz do Iguaçu", null, 2],
  ["BR", "Porto Alegre", null, 2],
  ["BR", "Curitiba", null, 2],
  ["BR", "Belo Horizonte", null, 2],
  ["TH", "Phuket", null, 2],
  ["VN", "Hanoi", "Hanói", 2],
  ["VN", "Ho Chi Minh City", "Ho Chi Minh", 2],
  ["HK", "Hong Kong", null, 2],
  ["MY", "Kuala Lumpur", null, 2],
  ["IL", "Jerusalem", "Jerusalém", 2],
  ["AE", "Abu Dhabi", null, 2],
  ["AU", "Melbourne", null, 2],
  ["NZ", "Auckland", null, 2],
  ["CA", "Vancouver", null, 2],
  ["CH", "Zürich", "Zurique", 2],
  ["DE", "Munich", "Munique", 2],
  ["FR", "Nice", null, 2],
  // tier 3: well-known travel stops
  ["BR", "Natal", null, 3],
  ["BR", "Maceió", null, 3],
  ["BR", "Porto Seguro", null, 3],
  ["BR", "Paraty", null, 3],
  ["BR", "Armação de Búzios", "Búzios", 3],
  ["BR", "São Luís", null, 3],
  ["BR", "Ouro Preto", null, 3],
  ["BR", "Campos do Jordão", null, 3],
  ["BR", "Ilhabela", null, 3],
  ["BR", "Balneário Camboriú", null, 3],
  ["CO", "Cartagena", null, 3],
  ["AR", "Ushuaia", null, 3],
  ["AR", "San Carlos de Bariloche", "Bariloche", 3],
  ["AR", "Mendoza", null, 3],
  ["UY", "Punta del Este", null, 3],
  ["NZ", "Queenstown", null, 3],
  ["TH", "Chiang Mai", null, 3],
  ["KH", "Siem Reap", null, 3],
  ["TW", "Taipei", "Taipé", 3],
  ["NP", "Kathmandu", "Catmandu", 3],
  ["IN", "Jaipur", null, 3],
  ["IN", "Agra", null, 3],
  ["LK", "Colombo", null, 3],
  ["MV", "Male", "Malé", 3],
  ["TZ", "Zanzibar", null, 3],
  ["EG", "Luxor", null, 3],
  ["IL", "Tel Aviv", null, 3],
  ["QA", "Doha", null, 3],
  ["TR", "Göreme", "Capadócia", 3],
  ["PT", "Porto", null, 3],
  ["ES", "Sevilla", "Sevilha", 3],
  ["ES", "Valencia", "Valência", 3],
  ["ES", "Málaga", null, 3],
  ["IT", "Naples", "Nápoles", 3],
  ["IT", "Turin", "Turim", 3],
  ["IT", "Bologna", "Bolonha", 3],
  ["DE", "Hamburg", "Hamburgo", 3],
  ["DE", "Frankfurt am Main", "Frankfurt", 3],
  
  ["GB", "Edinburgh", "Edimburgo", 3],
  ["IE", "Dublin", null, 3],
  ["BE", "Brussels", "Bruxelas", 3],
  ["DK", "Copenhagen", "Copenhague", 3],
  ["SE", "Stockholm", "Estocolmo", 3],
  ["FI", "Helsinki", "Helsinque", 3],
  ["PL", "Warsaw", "Varsóvia", 3],
  ["PL", "Kraków", "Cracóvia", 3],
  ["RU", "Saint Petersburg", "São Petersburgo", 3],
  ["FR", "Lyon", "Lião", 3],
  ["FR", "Marseille", "Marselha", 3],
  ["HR", "Dubrovnik", null, 3],
  ["CA", "Montréal", "Montreal", 3],
  ["CA", "Québec", "Quebec", 3],
  ["US", "Boston", null, 3],
  ["US", "New Orleans", "Nova Orleans", 3],
  ["US", "Seattle", null, 3],
  ["US", "San Diego", null, 3],
  ["US", "Honolulu", null, 3],
  ["ID", "Ubud", null, 3],
];

/** Destinations GeoNames doesn't list under a usable name: [country, Portuguese name, lat, lng, tier]. */
const CITY_EXTRAS = [
  ["BR", "Gramado", -29.3788, -50.8742, 3],
  ["PE", "Machu Picchu", -13.1631, -72.545, 3],
  ["CH", "Genebra", 46.2044, 6.1432, 3],
  ["BR", "Bonito", -21.1261, -56.4836, 4],
  ["BR", "Jericoacoara", -2.7967, -40.5131, 4],
  ["BR", "Fernando de Noronha", -3.8549, -32.4244, 4],
  ["GR", "Santorini", 36.3932, 25.4615, 3],
  ["GR", "Mykonos", 37.4467, 25.3289, 4],
  ["FR", "Cannes", 43.5528, 7.0174, 4],
];

const pop = (c) => c.population ?? 0;
const key = (cc, name) => `${cc}|${name}`;
const byKey = new Map();
for (const city of allCities) {
  const k = key(city.country, city.name);
  const existing = byKey.get(k);
  if (!existing || pop(city) > pop(existing)) byKey.set(k, city);
}

const missed = [];
const chosen = new Map(); // cityId -> {city, name, tier}
for (const [cc, name, pt, tier] of CITY_LIST) {
  const city = byKey.get(key(cc, name));
  if (!city) {
    missed.push(`${cc} ${name}`);
    continue;
  }
  chosen.set(city.cityId, { city, name: clean(pt ?? name), tier });
}

/** Local-name differences worth fixing for the automatic picks (capitals etc.). */
const AUTO_NAME_OVERRIDES = {
  "AT|Vienna": "Viena",
  "BE|Brussels": "Bruxelas",
  "DK|Copenhagen": "Copenhague",
  "SE|Stockholm": "Estocolmo",
  "FI|Helsinki": "Helsinque",
  "PL|Warsaw": "Varsóvia",
  "GR|Athens": "Atenas",
  "HU|Budapest": "Budapeste",
  "CZ|Prague": "Praga",
  "RO|Bucharest": "Bucareste",
  "BG|Sofia": "Sófia",
  "RS|Belgrade": "Belgrado",
  "UA|Kyiv": "Kiev",
  "BY|Minsk": "Minsk",
  "NO|Oslo": "Oslo",
  "IS|Reykjavík": "Reykjavik",
  "CH|Bern": "Berna",
  "NL|Amsterdam": "Amsterdã",
  "LU|Luxembourg": "Luxemburgo",
  "MC|Monaco": "Mônaco",
  "VA|Vatican City": "Vaticano",
  "TN|Tunis": "Túnis",
  "DZ|Algiers": "Argel",
  "LY|Tripoli": "Trípoli",
  "ET|Addis Ababa": "Adis Abeba",
  "SA|Riyadh": "Riade",
  "IQ|Baghdad": "Bagdá",
  "AF|Kabul": "Cabul",
  "BD|Dhaka": "Daca",
  "NP|Kathmandu": "Catmandu",
  "KP|Pyongyang": "Pyongyang",
  "KW|Kuwait City": "Cidade do Kuwait",
  "PA|Panama City": "Cidade do Panamá",
  "UY|Montevideo": "Montevidéu",
  "PY|Asunción": "Assunção",
  "GT|Guatemala City": "Cidade da Guatemala",
  "MA|Rabat": "Rabat",
  "SN|Dakar": "Dacar",
  "GH|Accra": "Acra",
  "AO|Luanda": "Luanda",
  "MZ|Maputo": "Maputo",
  "NZ|Wellington": "Wellington",
  "IN|New Delhi": "Nova Délhi",
  "SO|Mogadishu": "Mogadíscio",
  "IN|Kolkata": "Calcutá",
  "FM|Palikir - National Government Center": "Palikir",
  "SA|Mecca": "Meca",
  "PS|Ramallah": "Ramala",
  "DE|Cologne": "Colônia",
  "LB|Beirut": "Beirute",
  "SY|Damascus": "Damasco",
  "JO|Amman": "Amã",
  "TW|Taipei": "Taipé",
  "MM|Naypyidaw": "Naypyidaw",
  "CD|Kinshasa": "Kinshasa",
  "SD|Khartoum": "Cartum",
  "CU|Havana": "Havana",
  "JM|Kingston": "Kingston",
  "IQ|Mosul": "Mossul",
};

const MIN_POP = 700_000;
/** Automatic non-capital picks per country, so huge-but-obscure cities don't crowd the globe. */
const AUTO_CITY_CAP = { CN: 5, IN: 7, BR: 9, US: 10, RU: 6, JP: 5, DEFAULT: 4 };
const autoCount = new Map();
for (const { city } of chosen.values()) autoCount.set(city.country, (autoCount.get(city.country) ?? 0) + 1);
const candidates = allCities
  .filter((c) => c.featureCode === "PPLC" || pop(c) >= MIN_POP)
  .sort((a, b) => pop(b) - pop(a));

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const [lng1, lat1] = a.loc.coordinates;
  const [lng2, lat2] = b.loc.coordinates;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Greedy declutter: a big city's suburbs/neighbours (within 70 km, smaller) are dropped.
const kept = [...chosen.values()].map((entry) => entry.city);
// Capitals are always shown, so their suburbs/neighbours never need a second label.
for (const city of candidates) if (city.featureCode === "PPLC" && !chosen.has(city.cityId)) kept.push(city);
for (const city of candidates) {
  if (chosen.has(city.cityId)) continue;
  const isCapital = city.featureCode === "PPLC";
  if (!isCapital && kept.some((other) => distanceKm(city, other) < 70)) continue;
  const cap = AUTO_CITY_CAP[city.country] ?? AUTO_CITY_CAP.DEFAULT;
  if (!isCapital && (autoCount.get(city.country) ?? 0) >= cap) continue;
  const base = AUTO_NAME_OVERRIDES[key(city.country, city.name)] ?? city.name;
  const name = clean(base);
  if (!name) continue;
  // Small capitals wait for a closer zoom than the big ones.
  const tier = isCapital ? (pop(city) >= 1_000_000 ? 2 : 3) : pop(city) >= 3_000_000 ? 3 : 4;
  if (!isCapital) autoCount.set(city.country, (autoCount.get(city.country) ?? 0) + 1);
  chosen.set(city.cityId, { city, name, tier });
  kept.push(city);
}

for (const { city, name, tier } of chosen.values()) {
  if (!name) continue;
  const [lng, lat] = city.loc.coordinates;
  places.push({ k: "city", n: name, t: tier, s: -pop(city), lng: round(lng, 3), lat: round(lat, 3) });
}
for (const [, name, lat, lng, tier] of CITY_EXTRAS) {
  places.push({ k: "city", n: name, t: tier, s: 0, lng, lat });
}

// --- Regions (states / provinces) for the countries chosen for the globe -------------------

/** Portuguese names where they differ from the data's English ones, keyed "CC:code". */
const R = (cc, entries) => Object.fromEntries(Object.entries(entries).map(([code, name]) => [`${cc}:${code}`, name]));
const REGION_NAMES = {
  ...R("US", {
    AL: "Alabama", AK: "Alasca", AZ: "Arizona", AR: "Arkansas", CA: "Califórnia", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", FL: "Flórida", GA: "Geórgia", HI: "Havaí", ID: "Idaho",
    IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Luisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "Nova Hampshire", NJ: "Nova Jersey", NM: "Novo México", NY: "Nova York",
    NC: "Carolina do Norte", ND: "Dakota do Norte", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
    PA: "Pensilvânia", RI: "Rhode Island", SC: "Carolina do Sul", SD: "Dakota do Sul",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virgínia", WA: "Washington",
    WV: "Virgínia Ocidental", WI: "Wisconsin", WY: "Wyoming",
  }),
  ...R("CA", {
    AB: "Alberta", BC: "Colúmbia Britânica", MB: "Manitoba", NB: "Novo Brunswick",
    NL: "Terra Nova e Labrador", NT: "Territórios do Noroeste", NS: "Nova Escócia", NU: "Nunavut",
    ON: "Ontário", PE: "Ilha do Príncipe Eduardo", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
  }),
  ...R("AU", {
    ACT: "Território da Capital", NSW: "Nova Gales do Sul", NT: "Território do Norte",
    QLD: "Queensland", SA: "Austrália do Sul", TAS: "Tasmânia", VIC: "Vitória", WA: "Austrália Ocidental",
  }),
  ...R("MX", {
    CDMX: "Cidade do México", MEX: "Estado do México", COA: "Coahuila", MIC: "Michoacán",
    VER: "Veracruz", ROO: "Quintana Roo",
  }),
  ...R("AR", { C: "Buenos Aires (CABA)", S: "Santa Fé", E: "Entre Rios", R: "Rio Negro", V: "Terra do Fogo" }),
  ...R("FR", {
    ARA: "Auvérnia-Ródano-Alpes", BFC: "Borgonha-Franche-Comté", BRE: "Bretanha",
    CVL: "Centro-Vale do Loire", GES: "Grande Leste", HDF: "Alta França", NOR: "Normandia",
    NAQ: "Nova Aquitânia", OCC: "Occitânia", PDL: "País do Loire", PAC: "Provença-Alpes-Costa Azul",
    IDF: "Ilha de França",
  }),
  ...R("IT", {
    65: "Abruzos", 23: "Vale de Aosta", 75: "Apúlia", 77: "Basilicata", 78: "Calábria", 72: "Campânia",
    45: "Emília-Romanha", 36: "Friul-Veneza Júlia", 62: "Lácio", 42: "Ligúria", 25: "Lombardia",
    57: "Marcas", 67: "Molise", 21: "Piemonte", 88: "Sardenha", 82: "Sicília",
    32: "Trentino-Alto Ádige", 52: "Toscana", 55: "Úmbria", 34: "Vêneto",
  }),
  ...R("ES", {
    AN: "Andaluzia", AR: "Aragão", AS: "Astúrias", PM: "Ilhas Baleares", PV: "País Basco",
    CN: "Ilhas Canárias", CB: "Cantábria", CL: "Castela e Leão", CM: "Castela-La Mancha",
    CT: "Catalunha", EX: "Estremadura", GA: "Galícia", RI: "La Rioja", MD: "Madri",
    MC: "Múrcia", NC: "Navarra", VC: "Comunidade Valenciana",
  }),
  ...R("DE", {
    BW: "Baden-Württemberg", BY: "Baviera", BE: "Berlim", BB: "Brandemburgo", HB: "Bremen",
    HH: "Hamburgo", HE: "Hesse", MV: "Meclemburgo-Pomerânia", NI: "Baixa Saxônia",
    NW: "Renânia do Norte-Vestfália", RP: "Renânia-Palatinado", SL: "Sarre", SN: "Saxônia",
    ST: "Saxônia-Anhalt", SH: "Schleswig-Holstein", TH: "Turíngia",
  }),
  ...R("PT", {
    "01": "Aveiro", 20: "Açores", "02": "Beja", "03": "Braga", "04": "Bragança", "05": "Castelo Branco",
    "06": "Coimbra", "08": "Faro", "09": "Guarda", 10: "Leiria", 11: "Lisboa", 30: "Madeira",
    12: "Portalegre", 13: "Porto", 14: "Santarém", 15: "Setúbal", 16: "Viana do Castelo",
    17: "Vila Real", 18: "Viseu", "07": "Évora",
  }),
  ...R("GB", { ENG: "Inglaterra", NIR: "Irlanda do Norte", SCT: "Escócia", WLS: "País de Gales" }),
  ...R("ID", { JK: "Jacarta", JB: "Java Ocidental", JT: "Java Central", JI: "Java Oriental", YO: "Yogyakarta", SU: "Sumatra do Norte", SB: "Sumatra Ocidental", SS: "Sumatra do Sul", KB: "Bornéu Ocidental", KT: "Bornéu Central", KS: "Bornéu do Sul", KI: "Bornéu Oriental", PA: "Papua", NT: "Nusa Tenggara Oriental", NB: "Nusa Tenggara Ocidental", SN: "Celebes do Sul", SA: "Celebes do Norte", ST: "Celebes Central" }),
  ...R("CN", { BJ: "Pequim", SH: "Xangai", XJ: "Xinjiang", XZ: "Tibete", NM: "Mongólia Interior", HK: "Hong Kong", MO: "Macau", TJ: "Tianjin", CQ: "Chongqing", HL: "Heilongjiang" }),
  ...R("IN", { DH: "Dadra e Nagar Haveli e Daman e Diu", DL: "Délhi", JK: "Jammu e Caxemira", LA: "Ladaque", KL: "Querala", TN: "Tâmil Nadu", WB: "Bengala Ocidental", MH: "Maharashtra", GJ: "Guzerate", PB: "Punjab", RJ: "Rajastão", UP: "Uttar Pradesh", AN: "Ilhas Andamão" }),
  ...R("JP", { 13: "Tóquio", 26: "Quioto", 27: "Osaka", 1: "Hokkaido", 47: "Okinawa", 14: "Kanagawa", 23: "Aichi", 40: "Fukuoka", 34: "Hiroshima", 28: "Hyogo", 29: "Nara", 22: "Shizuoka", 20: "Nagano" }),
};

const REGION_COUNTRIES = ["BR", "US", "CA", "AU", "MX", "AR", "FR", "IT", "ES", "DE", "PT", "GB", "ID", "JP", "CN", "IN"];
/** Big countries show their regions earlier (tier 1); compact ones later (tier 2). */
const BIG_REGION_COUNTRIES = new Set(["BR", "US", "CA", "AU", "MX", "AR", "CN", "IN", "ID"]);
const US_EXCLUDED = new Set(["AS", "GU", "MP", "PR", "UM", "VI", "DC"]);
const REGION_FILTERS = {
  US: (s) => !US_EXCLUDED.has(s.isoCode) && !s.isoCode.startsWith("UM-"),
  ES: (s) => ["AN", "AR", "AS", "PM", "PV", "CN", "CB", "CL", "CM", "CT", "EX", "GA", "RI", "MD", "MC", "NC", "VC"].includes(s.isoCode),
  FR: (s) => /^[A-Z]{3}$/.test(s.isoCode),
  IT: (s) => /^\d{2}$/.test(s.isoCode),
  GB: (s) => ["ENG", "NIR", "SCT", "WLS"].includes(s.isoCode),
};

for (const cc of REGION_COUNTRIES) {
  const filter = REGION_FILTERS[cc] ?? (() => true);
  const states = State.getStatesOfCountry(cc).filter(
    (s) => filter(s) && s.latitude && s.longitude,
  );
  // Rank regions by the people living nearest to each (sum of nearby cities' populations).
  const weight = new Map(states.map((s) => [s.isoCode, 0]));
  const here = (c) => c.country === cc && pop(c) >= 100_000;
  for (const city of allCities.filter(here)) {
    let best = null;
    let bestDistance = Infinity;
    for (const s of states) {
      const d = distanceKm(city, { loc: { coordinates: [Number(s.longitude), Number(s.latitude)] } });
      if (d < bestDistance) {
        bestDistance = d;
        best = s;
      }
    }
    if (best) weight.set(best.isoCode, weight.get(best.isoCode) + pop(city));
  }
  for (const s of states) {
    const raw = REGION_NAMES[`${cc}:${s.isoCode}`] ?? s.name.replace(/ (Prefecture|Province|State)$/i, "");
    const name = clean(raw);
    if (!name) continue;
    places.push({
      k: "region",
      n: name,
      t: BIG_REGION_COUNTRIES.has(cc) ? 1 : 2,
      s: -weight.get(s.isoCode),
      lng: round(Number(s.longitude), 3),
      lat: round(Number(s.latitude), 3),
    });
  }
}

// --- Write ----------------------------------------------------------------------------------

const placesJson = {
  type: "FeatureCollection",
  features: places.map((p) => ({
    type: "Feature",
    properties: { k: p.k, n: p.n, t: p.t, s: Math.round(p.s) },
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
  })),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, "borders-v1.json"), JSON.stringify(bordersJson));
writeFileSync(path.join(OUT_DIR, "land-v1.json"), JSON.stringify(landJson));
writeFileSync(path.join(OUT_DIR, "ranges-v1.json"), JSON.stringify(rangesJson));
writeFileSync(path.join(OUT_DIR, "places-v1.json"), JSON.stringify(placesJson));

const count = (k, t) => places.filter((p) => p.k === k && (t === undefined || p.t === t)).length;
console.log("missed curated cities:", missed.length ? missed.join(", ") : "none");
console.log(
  `countries ${count("country")} (t1-4: ${[1, 2, 3, 4].map((t) => count("country", t)).join("/")})`,
  `cities ${count("city")} (t1-4: ${[1, 2, 3, 4].map((t) => count("city", t)).join("/")})`,
  `regions ${count("region")} (t1/t2: ${count("region", 1)}/${count("region", 2)})`,
);

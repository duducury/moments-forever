/**
 * Builds the tiny offline lookup that names WHERE a trip happened the moment its
 * photos are read — "CT, USA", "Itália" — without waiting for the reverse
 * geocoder:
 *
 *   public/geo/admin-v1.json
 *     countries  [{ c: ISO alpha-2, n: Portuguese name, b: bbox, p: polygons }]
 *     us         [{ a: state abbreviation, b: bbox, p: polygons }]   (exact state outlines)
 *
 * Polygons are rings of integer lon/lat ×100 (≈ 1 km), simplified — only good enough
 * to say which country / US state a coordinate is in, never for drawing.
 *
 * Sources (local npm packages, only needed when regenerating; none are app dependencies):
 *   world-atlas (Natural Earth 1:50m countries, public domain) · us-atlas (US Census states)
 *   topojson-client · i18n-iso-countries (Portuguese names, MIT)
 *
 * Regenerate:
 *   mkdir /tmp/geo && cd /tmp/geo && npm init -y && npm i world-atlas us-atlas topojson-client i18n-iso-countries
 *   GEO_DEPS_DIR=/tmp/geo node apps/web/scripts/build-admin-geo.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../public/geo/admin-v1.json");
const depsDir = process.env.GEO_DEPS_DIR ?? process.cwd();
const require = createRequire(path.join(depsDir, "package.json"));

const topojson = require("topojson-client");
const names = require("i18n-iso-countries");
names.registerLocale(require("i18n-iso-countries/langs/pt.json"));

const FIPS_TO_STATE = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
  "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA",
  "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
  "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY", "72": "PR",
};

/** Douglas–Peucker on an open polyline. */
function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let worst = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / len;
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (worst > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const q = (n) => Math.round(n * 100);

/** GeoJSON (Multi)Polygon → polygons of flat integer rings, [lon, lat, lon, lat, …] × 100. */
function encode(geometry, tolerance, minSpan) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const out = [];
  let biggest = null;
  let biggestSpan = -1;
  for (const polygon of polygons) {
    const rings = [];
    for (const ring of polygon) {
      const simple = simplify(ring.slice(0, -1), tolerance);
      if (simple.length < 3) continue;
      rings.push(simple.flatMap(([lon, lat]) => [q(lon), q(lat)]));
    }
    if (rings.length === 0) continue;
    const xs = polygon[0].map((p) => p[0]);
    const ys = polygon[0].map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (span > biggestSpan) {
      biggestSpan = span;
      biggest = rings;
    }
    if (span >= minSpan) out.push(rings);
  }
  if (out.length === 0 && biggest) out.push(biggest); // a small island country keeps its main island
  return out;
}

function bbox(polygons) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rings of polygons) {
    const ring = rings[0];
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]);
      minY = Math.min(minY, ring[i + 1]); maxY = Math.max(maxY, ring[i + 1]);
    }
  }
  return [minX, minY, maxX, maxY];
}

const world = JSON.parse(readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
const usAtlas = JSON.parse(readFileSync(require.resolve("us-atlas/states-10m.json"), "utf8"));

const countries = [];
for (const feature of topojson.feature(world, world.objects.countries).features) {
  const alpha2 = feature.id ? names.numericToAlpha2(String(feature.id).padStart(3, "0")) : undefined;
  if (!alpha2 || !feature.geometry) continue;
  const polygons = encode(feature.geometry, 0.08, 0.6);
  countries.push({ c: alpha2, n: names.getName(alpha2, "pt") ?? feature.properties.name, b: bbox(polygons), p: polygons });
}

const us = [];
for (const feature of topojson.feature(usAtlas, usAtlas.objects.states).features) {
  const abbreviation = FIPS_TO_STATE[String(feature.id).padStart(2, "0")];
  if (!abbreviation || !feature.geometry) continue;
  const polygons = encode(feature.geometry, 0.04, 0.2);
  us.push({ a: abbreviation, b: bbox(polygons), p: polygons });
}

const json = JSON.stringify({ countries, us });
writeFileSync(OUT, json);
console.log(`countries ${countries.length}, us states ${us.length} → ${(json.length / 1024).toFixed(0)} KB`);

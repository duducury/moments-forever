/**
 * Builds the Brazilian state outlines used by the "Brasil" share map:
 *
 *   public/geo/br-states-v1.json
 *     states  [{ a: state abbreviation, p: polygons → rings → flat [lon, lat, …] × 100 }]
 *
 * Source: IBGE state boundaries as GeoJSON (click_that_hood, brazil-states.geojson). Outer rings
 * only, simplified (Douglas–Peucker, ~2 km) — enough to draw clear state borders at country zoom.
 *
 * Regenerate:
 *   curl -o /tmp/brazil-states.geojson https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson
 *   node apps/web/scripts/build-br-states-geo.mjs /tmp/brazil-states.geojson
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../public/geo/br-states-v1.json");
const input = process.argv[2];
if (!input) throw new Error("usage: node build-br-states-geo.mjs <brazil-states.geojson>");

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let far = -1;
    let max = 0;
    for (let i = a + 1; i < b; i += 1) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
      if (d > max) {
        max = d;
        far = i;
      }
    }
    if (max > tolerance && far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const geo = JSON.parse(readFileSync(input, "utf8"));
const states = geo.features.map((feature) => {
  const g = feature.geometry;
  const polygons = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  const p = polygons
    .map((rings) => {
      // A closed ring starts and ends on the same point: simplify its two halves separately.
      const full = rings[0];
      const mid = Math.floor(full.length / 2);
      const ring = [...simplify(full.slice(0, mid + 1), 0.02), ...simplify(full.slice(mid), 0.02).slice(1)];
      if (ring.length < 4) return null;
      return [ring.flatMap(([lon, lat]) => [Math.round(lon * 100), Math.round(lat * 100)])];
    })
    .filter(Boolean);
  return { a: feature.properties.SIGLA, p };
});
writeFileSync(OUT, JSON.stringify({ states }));
console.log(`${states.length} states → ${OUT}`);

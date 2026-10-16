// Builds public/geo/stamp-shapes-v1.json: one tiny, simplified outline per country (and per US state), normalised to a
// 100x100 box, used ONLY to draw the decorative travel stamp in "Sobre essa viagem".
// Source: public/geo/admin-v1.json (already in the repo). Regenerate: node scripts/build-stamp-shapes.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const admin = JSON.parse(readFileSync(path.resolve(here, "../public/geo/admin-v1.json"), "utf8"));
const OUT = path.resolve(here, "../public/geo/stamp-shapes-v1.json");

// Countries whose far-away territories would distort the silhouette: keep only the largest landmass.
const MAINLAND_ONLY = new Set(["US", "FR"]);

const ringPoints = (flat) => {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i] / 100, flat[i + 1] / 100]);
  return pts;
};
const bbox = (pts) => {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [x, y] of pts) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return [a, b, c, d];
};
const area = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
};
function perp(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  if (l === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)];
}

function shape(code, polygons) {
  let rings = polygons.map((poly) => ringPoints(poly[0])).filter((r) => r.length >= 4);
  if (rings.length === 0) return null;
  const withMeta = rings.map((r) => ({ r, a: area(r), b: bbox(r) }));
  withMeta.sort((p, q) => q.a - p.a);
  const largest = withMeta[0];
  const ext = Math.max(largest.b[2] - largest.b[0], largest.b[3] - largest.b[1]);
  const cx = (largest.b[0] + largest.b[2]) / 2, cy = (largest.b[1] + largest.b[3]) / 2;
  const keep = MAINLAND_ONLY.has(code)
    ? [largest]
    : withMeta.filter((m) => {
        if (m === largest || m.a >= 0.22 * largest.a) return true;
        const mx = (m.b[0] + m.b[2]) / 2, my = (m.b[1] + m.b[3]) / 2;
        return m.a >= 0.02 * largest.a && Math.hypot(mx - cx, my - cy) <= ext;
      });
  // Equirectangular with cos(lat) correction around the centre.
  const lonShift = (lon) => (keep.some((k) => k.b[2] - k.b[0] > 180) || lon > 180 ? (lon < 0 ? lon + 360 : lon) : lon);
  const all = keep.flatMap((k) => k.r.map(([lon, lat]) => [lonShift(lon), lat]));
  const [minLon, minLat, maxLon, maxLat] = bbox(all);
  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const w = (maxLon - minLon) * k, h = maxLat - minLat;
  const scale = 100 / Math.max(w, h);
  const offX = (100 - w * scale) / 2, offY = (100 - h * scale) / 2;
  const project = ([lon, lat]) => [((lonShift(lon) - minLon) * k) * scale + offX, (maxLat - lat) * scale + offY];
  const tol = Math.max(w, h) * 0.012;
  const fmt = (n) => String(Math.round(n * 10) / 10);
  let d = "";
  for (const m of keep) {
    const pts = m.r.map(project);
    const simple = dp(pts, tol * scale);
    if (simple.length < 4) continue;
    d += "M" + simple.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L") + "Z";
  }
  return d || null;
}

const out = { countries: {}, us: {} };
for (const c of admin.countries) {
  const d = shape(c.c, c.p);
  if (d) out.countries[c.c] = d;
}
for (const s of admin.us) {
  const d = shape("US-" + s.a, s.p);
  if (d) out.us[s.a] = d;
}
writeFileSync(OUT, JSON.stringify(out));
console.log("countries", Object.keys(out.countries).length, "us", Object.keys(out.us).length, "bytes", JSON.stringify(out).length);

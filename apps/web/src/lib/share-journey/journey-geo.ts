/** Orthographic globe projection helpers for the share image (pure, no DOM). */

const RAD = Math.PI / 180;

export interface GlobeView {
  readonly centerLon: number;
  readonly centerLat: number;
}

export interface Projected {
  /** -1..1 on the unit disc. */
  readonly x: number;
  readonly y: number;
  /** False for the far side of the globe (x/y are pushed onto the limb). */
  readonly visible: boolean;
}

export function projectOrthographic(lon: number, lat: number, view: GlobeView): Projected {
  const phi = lat * RAD;
  const phi0 = view.centerLat * RAD;
  const dLon = (lon - view.centerLon) * RAD;
  const cosC = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(dLon);
  const x = Math.cos(phi) * Math.sin(dLon);
  const y = Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(dLon);
  if (cosC >= 0) return { x, y: -y, visible: true };
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: -y / length, visible: false };
}

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Picks the globe orientation that shows the most photos of the journey
 * (ties: the one closest to the overall centre). Data-driven, deterministic.
 */
export function bestGlobeView(
  clusters: readonly { latitude: number; longitude: number; count: number }[],
  /** Part of the unit disc that is actually on screen (y grows downwards). */
  bounds: { readonly yMin: number; readonly yMax: number; readonly xAbsMax?: number } = { yMin: -0.93, yMax: 0.93 },
): GlobeView {
  if (clusters.length === 0) return { centerLon: -30, centerLat: 15 };
  const meanLat = clusters.reduce((s, c) => s + c.latitude * c.count, 0) / clusters.reduce((s, c) => s + c.count, 0);
  const centerLat = Math.max(-25, Math.min(40, meanLat));
  let best: GlobeView = { centerLon: 0, centerLat };
  let bestScore = -Infinity;
  for (let lon = -180; lon < 180; lon += 10) {
    const view = { centerLon: lon, centerLat };
    let score = 0;
    let offCentre = 0;
    for (const cluster of clusters) {
      const p = projectOrthographic(cluster.longitude, cluster.latitude, view);
      // Only the inner part of the disc counts: pins near the limb get squashed.
      if (p.visible && Math.hypot(p.x, p.y) < 0.93 && p.y >= bounds.yMin && p.y <= bounds.yMax && Math.abs(p.x) <= (bounds.xAbsMax ?? 0.93)) {
        score += cluster.count;
        offCentre += cluster.count * Math.hypot(p.x, p.y);
      }
    }
    // Most photos on screen first; among equals, the view that centres them best.
    const total = score * 1000 - offCentre;
    if (total > bestScore) {
      bestScore = total;
      best = view;
    }
  }
  return { centerLon: wrapLon(best.centerLon), centerLat };
}

/** Great-circle samples between two places (for the dotted flight routes). */
export function greatCircle(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  steps = 48,
): { latitude: number; longitude: number }[] {
  const toVec = (lat: number, lon: number) => [
    Math.cos(lat * RAD) * Math.cos(lon * RAD),
    Math.cos(lat * RAD) * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
  ] as const;
  const va = toVec(a.latitude, a.longitude);
  const vb = toVec(b.latitude, b.longitude);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return [{ ...a }];
  const out: { latitude: number; longitude: number }[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const s1 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const s2 = Math.sin(t * omega) / Math.sin(omega);
    const x = s1 * va[0] + s2 * vb[0];
    const y = s1 * va[1] + s2 * vb[1];
    const z = s1 * va[2] + s2 * vb[2];
    out.push({ latitude: Math.asin(z) / RAD, longitude: Math.atan2(y, x) / RAD });
  }
  return out;
}

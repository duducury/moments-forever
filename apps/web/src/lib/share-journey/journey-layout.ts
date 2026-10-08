/** Where the map pins, dots and flight routes go on the share image (pure). */

import type { JourneyCluster } from "./journey-summary";
import { greatCircle, projectOrthographic, type GlobeView } from "./journey-geo";

export interface GlobeFrame {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  /** Only things inside this vertical band are drawn (the rest is covered by other blocks). */
  readonly yMin: number;
  readonly yMax: number;
  /** Keep pins this far from the left/right edges of the image. */
  readonly xInset?: number;
}

export interface PlacedCluster {
  readonly cluster: JourneyCluster;
  readonly x: number;
  readonly y: number;
}

export interface GlobeLayout {
  /** Biggest clusters that fit without overlapping: drawn as photo pins. */
  readonly pins: readonly PlacedCluster[];
  /** The rest of the visible clusters: small glowing dots. */
  readonly dots: readonly PlacedCluster[];
  /** Route legs as runs of screen points, in visiting order. */
  readonly routes: readonly (readonly { x: number; y: number }[])[];
}

export function layoutGlobe(
  clusters: readonly JourneyCluster[],
  view: GlobeView,
  frame: GlobeFrame,
  options: { readonly maxPins?: number; readonly minPinDistance?: number; readonly maxLegs?: number } = {},
): GlobeLayout {
  const maxPins = options.maxPins ?? 10;
  const minDist = options.minPinDistance ?? 110;
  const maxLegs = options.maxLegs ?? 14;

  const placed: PlacedCluster[] = [];
  for (const cluster of clusters) {
    const p = projectOrthographic(cluster.longitude, cluster.latitude, view);
    if (!p.visible || Math.hypot(p.x, p.y) > 0.95) continue;
    const x = frame.cx + p.x * frame.radius;
    const y = frame.cy + p.y * frame.radius;
    if (y < frame.yMin || y > frame.yMax) continue;
    if (frame.xInset && (x < frame.xInset || x > 2 * frame.cx - frame.xInset)) continue;
    placed.push({ cluster, x, y });
  }

  // Clusters arrive biggest-first; keep a pin only when it clears the pins already kept.
  const pins: PlacedCluster[] = [];
  const dots: PlacedCluster[] = [];
  for (const item of placed) {
    const clear = pins.every((pin) => Math.hypot(pin.x - item.x, pin.y - item.y) >= minDist);
    if (pins.length < maxPins && clear) pins.push(item);
    else dots.push(item);
  }

  // Route: oldest to newest among the visible places.
  const ordered = [...placed]
    .filter((item) => item.cluster.firstAt)
    .sort((a, b) => Date.parse(a.cluster.firstAt!) - Date.parse(b.cluster.firstAt!));
  const routes: { x: number; y: number }[][] = [];
  for (let i = 0; i + 1 < ordered.length && routes.length < maxLegs; i += 1) {
    const a = ordered[i]!.cluster;
    const b = ordered[i + 1]!.cluster;
    if (Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude) < 3) continue;
    let run: { x: number; y: number }[] = [];
    for (const sample of greatCircle(a, b)) {
      const p = projectOrthographic(sample.longitude, sample.latitude, view);
      const x = frame.cx + p.x * frame.radius;
      const y = frame.cy + p.y * frame.radius;
      if (p.visible && y >= frame.yMin && y <= frame.yMax) {
        run.push({ x, y });
      } else if (run.length > 1) {
        routes.push(run);
        run = [];
      } else {
        run = [];
      }
    }
    if (run.length > 1) routes.push(run);
  }
  return { pins, dots, routes };
}

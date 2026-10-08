/**
 * Flat world map (equirectangular) helpers for the share image. Pure, no DOM.
 * The map is fed by ALL the owner's GPS photos; nothing here knows about the
 * favourite trips. Places are drawn on their own (dots and photo pins): there
 * are no routes or lines connecting them.
 */

import type { JourneyCluster } from "./journey-summary";

export interface MapFrame {
  /** Map rectangle on the image (the ocean panel). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Visible longitude / latitude window. */
  readonly lonMin: number;
  readonly lonMax: number;
  readonly latMin: number;
  readonly latMax: number;
  /** Vertical stretch of the map relative to its horizontal scale (default 1). */
  readonly yStretch?: number;
  /** Radius of the planet's horizon curve; the map bends down towards the sides (0 = flat). */
  readonly curveRadius?: number;
}

/** How far the horizon drops at `x` (0 in the middle of the frame). */
export function horizonDrop(x: number, frame: MapFrame): number {
  const radius = frame.curveRadius ?? 0;
  if (radius <= 0) return 0;
  const dx = Math.min(Math.abs(x - (frame.x + frame.width / 2)), radius * 0.99);
  return radius - Math.sqrt(radius * radius - dx * dx);
}

export function projectFlat(lon: number, lat: number, frame: MapFrame): { x: number; y: number } {
  const scale = frame.width / (frame.lonMax - frame.lonMin);
  const vertical = scale * (frame.yStretch ?? 1);
  const used = (frame.latMax - frame.latMin) * vertical;
  const top = frame.y + (frame.height - used) / 2;
  const x = frame.x + (lon - frame.lonMin) * scale;
  return { x, y: top + (frame.latMax - lat) * vertical + horizonDrop(x, frame) };
}

export interface PlacedCluster {
  readonly cluster: JourneyCluster;
  readonly x: number;
  readonly y: number;
}

export interface MapLayout {
  /** Biggest places that fit without overlapping: drawn as photo pins. */
  readonly pins: readonly PlacedCluster[];
  /** Every other place (positioned, not drawn as a picture). */
  readonly unpinned: readonly PlacedCluster[];
}

/**
 * Places every cluster on the map. Nothing is dropped: a place is either a
 * photo pin or "unpinned" (no marker is drawn for those: no dots, no lines). Clusters must arrive biggest first.
 */
export function layoutWorldMap(
  clusters: readonly JourneyCluster[],
  frame: MapFrame,
  options: { readonly maxPins?: number; readonly minPinDistance?: number; readonly pinHeadroom?: number; readonly skyAllowance?: number } = {},
): MapLayout {
  const maxPins = options.maxPins ?? 9;
  const minDist = options.minPinDistance ?? 105;
  // The map is part of the sky now (no box): a pin head may rise a bit above the horizon.
  const sky = options.skyAllowance ?? 0;
  // A pin's round head sits above its tip: keep it inside the map panel.
  const headroom = options.pinHeadroom ?? 112;

  const pins: PlacedCluster[] = [];
  const unpinned: PlacedCluster[] = [];
  for (const cluster of clusters) {
    const item = { cluster, ...projectFlat(cluster.longitude, cluster.latitude, frame) };
    const clear = pins.every((pin) => Math.hypot(pin.x - item.x, pin.y - item.y) >= minDist);
    const fits = item.y - headroom >= frame.y - sky && item.x >= frame.x + 50 && item.x <= frame.x + frame.width - 50;
    if (pins.length < maxPins && clear && fits) pins.push(item);
    else unpinned.push(item);
  }
  return { pins, unpinned };
}

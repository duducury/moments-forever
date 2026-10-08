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

/** A photo pin: the tip is on the place, the round head (radius `radius`) sits above it. */
export interface PlacedPin extends PlacedCluster {
  readonly radius: number;
}

export interface MapLayout {
  /** Photo pins, spread over the world (biggest places of each region first). */
  readonly pins: readonly PlacedPin[];
  /** Every other place (positioned, not drawn as a picture). */
  readonly unpinned: readonly PlacedCluster[];
}

/** Head centre of a pin whose tip is at `y`. */
export function pinHeadCentre(y: number, radius: number): number {
  return y - radius * 1.48;
}

export interface LayoutOptions {
  /** Hard cap; the selection is by geography first, this only stops runaway counts. */
  readonly maxPins?: number;
  /** Head radii to try, biggest first (a pin shrinks before it is dropped). */
  readonly radii?: readonly number[];
  /** Free space between two pin heads. */
  readonly gap?: number;
  /** Size (degrees) of the regions used to spread the pins. */
  readonly regionDegrees?: number;
  /** Pins a single region may take in the first pass (the rest wait for the others). */
  readonly regionCap?: number;
  /** A pin head may rise this far above the top of the map (the map has no box). */
  readonly skyAllowance?: number;
}

/**
 * Chooses which places get a photo pin, spreading them geographically:
 *  1. places are visited biggest first;
 *  2. in the first pass each ~20° region may take only `regionCap` pins, so a
 *     region with many photos cannot use up every pin;
 *  3. a second pass fills any room left, relaxing the cap;
 *  4. a pin is drawn at the largest size whose head does not overlap another
 *     head; if even the smallest overlaps, the place stays unpinned.
 * Nothing is dropped from the data: places without a pin stay in `unpinned`.
 */
export function layoutWorldMap(
  clusters: readonly JourneyCluster[],
  frame: MapFrame,
  options: LayoutOptions = {},
): MapLayout {
  const maxPins = options.maxPins ?? 18;
  const radii = options.radii ?? [38, 26, 18, 10];
  const gap = options.gap ?? 2;
  const regionDegrees = options.regionDegrees ?? 20;
  const regionCap = options.regionCap ?? 3;
  const sky = options.skyAllowance ?? 0;

  const placed = clusters.map((cluster) => ({ cluster, ...projectFlat(cluster.longitude, cluster.latitude, frame) }));
  const pins: PlacedPin[] = [];
  const taken = new Set<PlacedCluster>();
  const perRegion = new Map<string, number>();
  const regionOf = (c: JourneyCluster) => `${Math.floor(c.latitude / regionDegrees)}:${Math.floor(c.longitude / regionDegrees)}`;

  const smallest = radii[radii.length - 1]!;
  const fits = (item: PlacedCluster, radius: number, ignore?: PlacedPin): boolean => {
    const headY = pinHeadCentre(item.y, radius);
    const inside =
      item.x - radius >= frame.x + 8 && item.x + radius <= frame.x + frame.width - 8 && headY - radius >= frame.y - sky;
    if (!inside) return false;
    return pins.every(
      (pin) => pin === ignore || Math.hypot(pin.x - item.x, pinHeadCentre(pin.y, pin.radius) - headY) >= pin.radius + radius + gap,
    );
  };

  // Phase 1 — choose WHICH places get a pin, assuming the smallest size so that
  // crowded regions (many destinations close together, anywhere) can show every distinct one.
  for (const cap of [regionCap, Infinity]) {
    for (const item of placed) {
      if (pins.length >= maxPins) break;
      if (taken.has(item)) continue;
      const region = regionOf(item.cluster);
      if ((perRegion.get(region) ?? 0) >= cap) continue;
      if (fits(item, smallest)) {
        pins.push({ ...item, radius: smallest });
        taken.add(item);
        perRegion.set(region, (perRegion.get(region) ?? 0) + 1);
      }
    }
  }

  // Phase 2 — grow pins to the largest size that still clears their neighbours,
  // biggest places first, so important destinations stand out.
  pins.forEach((pin, index) => {
    for (const radius of radii) {
      if (radius <= pin.radius) break;
      if (fits(pin, radius, pin)) {
        pins[index] = { ...pin, radius };
        break;
      }
    }
  });
  const unpinned = placed.filter((item) => !taken.has(item));
  return { pins, unpinned };
}

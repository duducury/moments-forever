/**
 * Flat map (equirectangular) helpers for the share image. Pure, no DOM.
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
  /** Id of the map view (frame) the place was projected with. */
  readonly view: string;
}

/** A photo pin: the tip is on the place, the round head (radius `radius`) sits above it. */
export interface PlacedPin extends PlacedCluster {
  readonly radius: number;
}

export interface MapLayout {
  /** Photo pins, spread geographically. ALL of them have the same `radius`. */
  readonly pins: readonly PlacedPin[];
  /** The one head radius shared by every pin of this layout. */
  readonly pinRadius: number;
  /** Every other place (positioned, not drawn as a picture). */
  readonly unpinned: readonly PlacedCluster[];
}

/** Head centre of a pin whose tip is at `y`. */
export function pinHeadCentre(y: number, radius: number): number {
  return y - radius * 1.48;
}

/** A frame plus the geographic box it shows (several frames = main map + insets). */
export interface LayoutView {
  readonly id: string;
  readonly frame: MapFrame;
  /** [lonMin, latMin, lonMax, latMax]; the first view containing a place draws it. */
  readonly box: readonly [number, number, number, number];
}

export interface LayoutOptions {
  /** Hard cap; the selection is by geography first, this only stops runaway counts. */
  readonly maxPins?: number;
  /** Head radii the layout may use, biggest first. One of them is picked for ALL pins. */
  readonly radii?: readonly number[];
  /** Free space between two pin heads. */
  readonly gap?: number;
  /** Size (degrees) of the regions used to spread the pins. */
  readonly regionDegrees?: number;
  /** Pins a single region may take in the first pass (the rest wait for the others). */
  readonly regionCap?: number;
  /** A pin head may rise this far above the top of its frame (the map has no box). */
  readonly skyAllowance?: number;
  /** How much of the pins that fit at the smallest size the chosen size must still keep. */
  readonly keepShare?: number;
}

/**
 * Chooses which places get a photo pin and the single pin size:
 *  1. places are visited biggest first;
 *  2. in the first pass each ~20° region may take only `regionCap` pins, so a
 *     region with many photos cannot use up every pin;
 *  3. a second pass fills any room left, relaxing the cap;
 *  4. the size is a LAYOUT decision, never the photo count: the biggest radius
 *     that still keeps `keepShare` of the pins the smallest radius can place.
 *     Every pin then has exactly that radius.
 * Nothing is dropped from the data: places without a pin stay in `unpinned`.
 */
export function layoutMapViews(
  clusters: readonly JourneyCluster[],
  views: readonly LayoutView[],
  options: LayoutOptions = {},
): MapLayout {
  const maxPins = options.maxPins ?? 18;
  const radii = [...(options.radii ?? [34, 30, 26, 22, 18])].sort((a, b) => b - a);
  const gap = options.gap ?? 2;
  const regionDegrees = options.regionDegrees ?? 20;
  const regionCap = options.regionCap ?? 3;
  const sky = options.skyAllowance ?? 0;
  const keepShare = options.keepShare ?? 0.8;

  const frames = new Map(views.map((view) => [view.id, view.frame]));
  const placed: PlacedCluster[] = [];
  for (const cluster of clusters) {
    const view = views.find((v) => {
      const [lonMin, latMin, lonMax, latMax] = v.box;
      return cluster.longitude >= lonMin && cluster.longitude <= lonMax && cluster.latitude >= latMin && cluster.latitude <= latMax;
    });
    if (!view) continue;
    placed.push({ cluster, view: view.id, ...projectFlat(cluster.longitude, cluster.latitude, view.frame) });
  }

  const regionOf = (c: JourneyCluster) => `${Math.floor(c.latitude / regionDegrees)}:${Math.floor(c.longitude / regionDegrees)}`;

  const select = (radius: number): PlacedCluster[] => {
    const chosen: PlacedCluster[] = [];
    const perRegion = new Map<string, number>();
    const fits = (item: PlacedCluster): boolean => {
      const frame = frames.get(item.view)!;
      const headY = pinHeadCentre(item.y, radius);
      const inside =
        item.x - radius >= frame.x + 8 && item.x + radius <= frame.x + frame.width - 8 && headY - radius >= frame.y - sky;
      if (!inside) return false;
      return chosen.every((other) => Math.hypot(other.x - item.x, pinHeadCentre(other.y, radius) - headY) >= radius * 2 + gap);
    };
    for (const cap of [regionCap, Infinity]) {
      for (const item of placed) {
        if (chosen.length >= maxPins) break;
        if (chosen.includes(item)) continue;
        const region = regionOf(item.cluster);
        if ((perRegion.get(region) ?? 0) >= cap) continue;
        if (fits(item)) {
          chosen.push(item);
          perRegion.set(region, (perRegion.get(region) ?? 0) + 1);
        }
      }
    }
    return chosen;
  };

  const smallest = radii[radii.length - 1]!;
  const atSmallest = select(smallest);
  const wanted = Math.ceil(atSmallest.length * keepShare);
  let pinRadius = smallest;
  let chosen = atSmallest;
  for (const radius of radii) {
    const attempt = radius === smallest ? atSmallest : select(radius);
    if (attempt.length >= wanted) {
      pinRadius = radius;
      chosen = attempt;
      break;
    }
  }
  const pins: PlacedPin[] = chosen.map((item) => ({ ...item, radius: pinRadius }));
  const unpinned = placed.filter((item) => !chosen.includes(item));
  return { pins, pinRadius, unpinned };
}

/** Single-frame convenience (the world map). */
export function layoutWorldMap(
  clusters: readonly JourneyCluster[],
  frame: MapFrame,
  options: LayoutOptions = {},
): MapLayout {
  return layoutMapViews(clusters, [{ id: "main", frame, box: [-180, -90, 180, 90] }], options);
}

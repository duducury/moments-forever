/**
 * Depth for the space behind the globe: the stars and nebula follow the real
 * movement of the MapLibre camera, but only a small fraction of it, so the
 * Earth feels close and the sky far away.
 */

/** Share of the globe's own on-screen movement that each layer gets. */
export const PARALLAX_DEPTH = {
  far: 0.22,
  mid: 0.38,
  near: 0.55,
  nebula: 0.12,
} as const;

export type ParallaxLayer = keyof typeof PARALLAX_DEPTH;

/** Shortest signed longitude difference, so crossing the antimeridian isn't a 360° jump. */
export function wrapLongitudeDelta(deltaDegrees: number): number {
  return ((((deltaDegrees + 180) % 360) + 360) % 360) - 180;
}

export interface CameraCenter {
  readonly lng: number;
  readonly lat: number;
}

const WORLD_TILE = 512;
const MAX_LATITUDE = 80;

/**
 * How far (px) the globe's surface *at the centre of the screen* just moved
 * when the camera went from `from` to `to`. That is the movement the person's
 * finger sees: whatever is under the finger follows it 1:1. MapLibre's globe
 * uses the Mercator scale at the centre, so a degree of longitude is
 * 512·2^zoom / 360 px and a degree of latitude is that / cos(latitude). The
 * surface moves against the camera: heading east slides the globe left,
 * heading north slides it down.
 */
export function globeSurfaceShift(
  from: CameraCenter,
  to: CameraCenter,
  zoom: number,
): { readonly dx: number; readonly dy: number } {
  const rad = Math.PI / 180;
  const pxPerRadian = (WORLD_TILE * 2 ** zoom) / (2 * Math.PI);
  const dLng = wrapLongitudeDelta(to.lng - from.lng) * rad;
  const dLat = (to.lat - from.lat) * rad;
  const midLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, (from.lat + to.lat) / 2)) * rad;
  const dx = -pxPerRadian * dLng;
  const dy = (pxPerRadian * dLat) / Math.cos(midLat);
  return {
    dx: Number.isFinite(dx) ? dx : 0,
    dy: Number.isFinite(dy) ? dy : 0,
  };
}

/** Maps any offset into [0, period) so a tiled layer can scroll forever without gaps. */
export function wrapOffset(value: number, period: number): number {
  if (!(period > 0)) return 0;
  return ((value % period) + period) % period;
}

/** Bounded, smooth offset for a layer that can't tile (the nebula): never passes ±limit. */
export function softClamp(value: number, limit: number): number {
  if (!(limit > 0)) return 0;
  return limit * Math.tanh(value / limit);
}

/**
 * Frame-rate independent exponential smoothing: moves `current` toward
 * `target`, covering half the remaining distance every `halfLifeMs`.
 */
export function easeToward(
  current: number,
  target: number,
  elapsedMs: number,
  halfLifeMs: number,
): number {
  if (!(halfLifeMs > 0) || !(elapsedMs > 0)) return current;
  const keep = 0.5 ** (elapsedMs / halfLifeMs);
  return target + (current - target) * keep;
}

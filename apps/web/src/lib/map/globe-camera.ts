import { globeScreenRadius } from "./globe-geometry";

/**
 * Where the immersive globe opens: the whole Earth in view, turned to the
 * Americas (between Brazil and the USA), after a short arrival animation. It
 * used to open on a camera fitted around every pin (up to zoom 3.8), which was
 * too close and landed somewhere different for everyone. Only when none of the
 * person's places is anywhere near the Americas (say, trips only in Asia) does
 * it turn to face their pins instead, so the first thing seen is never an
 * empty ocean.
 */
export const DEFAULT_GLOBE_CAMERA = {
  /** [lng, lat] */
  center: [-63, 12] as [number, number],
  /** Used only when the screen size isn't known yet; normally zoomToFitGlobe() decides. */
  zoom: 1.3,
} as const;

/** Angular radius around the default centre that counts as "in view" (≈ the visible cap). */
export const DEFAULT_VIEW_REACH_DEGREES = 58;

export interface LngLat {
  readonly lng: number;
  readonly lat: number;
}

/** Great-circle distance between two points, in degrees of arc. */
export function angularDistanceDegrees(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const cos =
    Math.sin(a.lat * rad) * Math.sin(b.lat * rad) +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((a.lng - b.lng) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / rad;
}

/** True when at least one place is inside the default view, so the default camera is worth opening on. */
export function hasPlaceNearDefaultView(
  places: readonly { readonly longitude: number; readonly latitude: number }[],
): boolean {
  const centre = { lng: DEFAULT_GLOBE_CAMERA.center[0], lat: DEFAULT_GLOBE_CAMERA.center[1] };
  return places.some(
    (place) =>
      angularDistanceDegrees(centre, { lng: place.longitude, lat: place.latitude }) <=
      DEFAULT_VIEW_REACH_DEGREES,
  );
}

const MIN_FIT_ZOOM = 0.9;
const MAX_FIT_ZOOM = 2.4;

/**
 * The zoom at which the whole globe fits the screen, with a little air around
 * it: its diameter is `fill` × the shorter side of the map. Works out the same
 * on a phone, an iPad and a desktop window.
 */
export function zoomToFitGlobe(
  width: number,
  height: number,
  latitude: number,
  fill = 0.9,
): number {
  if (!(width > 0) || !(height > 0)) return DEFAULT_GLOBE_CAMERA.zoom;
  const wantedRadius = (Math.min(width, height) * fill) / 2;
  let low = MIN_FIT_ZOOM;
  let high = MAX_FIT_ZOOM;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (globeScreenRadius(middle, height, latitude) > wantedRadius) high = middle;
    else low = middle;
  }
  return Math.round(low * 100) / 100;
}

/** The short arrival animation: the Earth turns in from the east while settling a little closer. */
export const INTRO = {
  durationMs: 1900,
  /** Degrees of longitude the globe has still to turn when the page opens. */
  turnDegrees: 38,
  /** How much further back it starts. */
  zoomOut: 0.45,
} as const;

/** Ease-out cubic: quick at first, settling gently. */
export function introEasing(t: number): number {
  return 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
}

export interface IntroCamera {
  readonly center: [number, number];
  readonly zoom: number;
}

/** Where the arrival animation starts, for a given resting camera. */
export function introStart(target: IntroCamera): IntroCamera {
  const lng = ((target.center[0] + INTRO.turnDegrees + 540) % 360) - 180;
  return { center: [lng, target.center[1]], zoom: Math.max(0.6, target.zoom - INTRO.zoomOut) };
}

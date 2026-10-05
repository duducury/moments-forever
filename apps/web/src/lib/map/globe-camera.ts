/**
 * Where the immersive globe opens. It used to open on a camera fitted around
 * every pin (up to zoom 3.8), which was often too close and landed somewhere
 * different for everyone. It now always opens on the same wider view of the
 * Americas — between Brazil and the USA — and the person turns the globe from
 * there. Only when none of their places is anywhere near that view (say, a
 * profile whose trips are all in Asia) does it frame the pins instead, so the
 * first thing seen is never an empty ocean.
 */
export const DEFAULT_GLOBE_CAMERA = {
  /** [lng, lat] */
  center: [-63, 12] as [number, number],
  zoom: 2.2,
} as const;

/** Angular radius around the default centre that counts as "in view" (≈ the visible cap). */
export const DEFAULT_VIEW_REACH_DEGREES = 58;

/** How close the fallback framing may zoom (never as tight as before). */
export const FALLBACK_MAX_ZOOM = 2.6;

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

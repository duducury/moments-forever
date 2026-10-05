/**
 * Where the MapLibre globe sits on screen, so decorative layers (atmosphere,
 * lighting) can be drawn exactly around it without touching the map itself.
 *
 * MapLibre doesn't expose the sphere's on-screen radius. This was worked out
 * against maplibre-gl 5.x by reading the silhouette of a flat-coloured globe
 * from screenshots (several zooms, latitudes and viewport sizes; every sample
 * within 1–2 px): the camera has a 36.87° vertical field of view; at the map
 * centre the sphere has the scale of a plain 512·2^zoom / 2π world divided by
 * cos(latitude of the centre) — "zoom" is a Mercator zoom — and the visible
 * silhouette is the perspective horizon, not that nadir scale.
 */
const FOCAL_PER_HEIGHT = 1.5; // 1 / tan(fov / 2) / 2 for a 36.87° fov
const WORLD_TILE = 512;
const MAX_LATITUDE = 80;

/** On-screen radius, in CSS px, of the globe silhouette (centred in the map). */
export function globeScreenRadius(
  zoom: number,
  viewportHeight: number,
  centerLatitude = 0,
): number {
  if (!Number.isFinite(zoom) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 0;
  }
  const latitude = Number.isFinite(centerLatitude)
    ? Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, centerLatitude))
    : 0;
  const focal = FOCAL_PER_HEIGHT * viewportHeight;
  const nadirRadius =
    (WORLD_TILE * 2 ** zoom) / (2 * Math.PI) / Math.cos((latitude * Math.PI) / 180);
  const distance = 1 + focal / nadirRadius; // camera distance, in sphere radii
  return focal / Math.sqrt(distance * distance - 1);
}

const FADE_START_ZOOM = 3.6;
const FADE_END_ZOOM = 4.8;

/**
 * 1 while the whole planet is in view, fading to 0 as the map zooms toward a
 * region (MapLibre flattens the globe there and the lighting circle would float in space).
 */
export function globeEffectOpacity(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= FADE_START_ZOOM) return 1;
  if (zoom >= FADE_END_ZOOM) return 0;
  return 1 - (zoom - FADE_START_ZOOM) / (FADE_END_ZOOM - FADE_START_ZOOM);
}

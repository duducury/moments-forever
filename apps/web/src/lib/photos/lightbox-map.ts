/** Geometry of the viewer's mini map: a handful of OpenStreetMap tiles around the photo, no map library. */

export const MINI_MAP_ZOOM = 10;
const TILE_SIZE = 256;

export function hasValidCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): latitude is number {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -85 &&
    latitude <= 85 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** World pixel of a point at a zoom level (Web Mercator, 256 px tiles). */
export function worldPixel(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export interface MiniMapTile {
  readonly key: string;
  readonly url: string;
  /** Position of the tile's top-left corner relative to the map box. */
  readonly left: number;
  readonly top: number;
}

/** Tiles that cover a `width` × `height` box centred on the point. */
export function miniMapTiles(
  latitude: number,
  longitude: number,
  width: number,
  height: number,
  zoom: number = MINI_MAP_ZOOM,
): readonly MiniMapTile[] {
  const center = worldPixel(latitude, longitude, zoom);
  const originX = center.x - width / 2;
  const originY = center.y - height / 2;
  const max = 2 ** zoom;
  const tiles: MiniMapTile[] = [];
  for (let ty = Math.floor(originY / TILE_SIZE); ty <= Math.floor((originY + height) / TILE_SIZE); ty += 1) {
    for (let tx = Math.floor(originX / TILE_SIZE); tx <= Math.floor((originX + width) / TILE_SIZE); tx += 1) {
      if (ty < 0 || ty >= max) continue;
      const wrappedX = ((tx % max) + max) % max;
      tiles.push({
        key: `${zoom}/${wrappedX}/${ty}@${tx}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`,
        left: Math.round(tx * TILE_SIZE - originX),
        top: Math.round(ty * TILE_SIZE - originY),
      });
    }
  }
  return tiles;
}

/** Where tapping the mini map goes: the system maps app / site at the photo's position. */
export function openInMapsUrl(latitude: number, longitude: number, label: string | null): string {
  const query = new URLSearchParams({
    ll: `${latitude.toFixed(5)},${longitude.toFixed(5)}`,
    z: "14",
  });
  if (label) query.set("q", label);
  return `https://maps.apple.com/?${query.toString()}`;
}

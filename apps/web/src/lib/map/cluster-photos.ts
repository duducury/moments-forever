export interface GeoPoint<T = unknown> {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly data: T;
}

export interface PhotoCluster<T = unknown> {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly points: readonly GeoPoint<T>[];
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadius = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Approximate cluster radius in meters for a Leaflet zoom level. */
export function clusterRadiusForZoom(zoom: number): number {
  if (zoom >= 17) return 25;
  if (zoom >= 15) return 80;
  if (zoom >= 13) return 250;
  if (zoom >= 11) return 900;
  if (zoom >= 9) return 3_000;
  if (zoom >= 7) return 12_000;
  return 40_000;
}

/**
 * Greedy proximity clustering for map markers.
 * Nearby points collapse into one marker; radius depends on zoom.
 */
export function clusterGeoPoints<T>(
  points: readonly GeoPoint<T>[],
  radiusMeters: number,
): readonly PhotoCluster<T>[] {
  const remaining = [...points];
  const clusters: PhotoCluster<T>[] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift();
    if (!seed) break;

    const members: GeoPoint<T>[] = [seed];
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index];
      if (!candidate) continue;
      if (
        distanceMeters(
          seed.latitude,
          seed.longitude,
          candidate.latitude,
          candidate.longitude,
        ) <= radiusMeters
      ) {
        members.push(candidate);
        remaining.splice(index, 1);
      }
    }

    const latitude =
      members.reduce((sum, item) => sum + item.latitude, 0) / members.length;
    const longitude =
      members.reduce((sum, item) => sum + item.longitude, 0) / members.length;
    const ids = members
      .map((item) => item.id)
      .sort()
      .join("-");

    clusters.push({
      id: ids,
      latitude,
      longitude,
      points: members,
    });
  }

  return clusters;
}

export function boundsFromGeoPoints<T>(
  points: readonly GeoPoint<T>[],
): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLat = points[0]!.latitude;
  let maxLat = points[0]!.latitude;
  let minLng = points[0]!.longitude;
  let maxLng = points[0]!.longitude;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

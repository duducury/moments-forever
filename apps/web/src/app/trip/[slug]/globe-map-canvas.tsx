"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { getLocalPhotoBlob } from "@/lib/local-photos/photo-blob-store";
import {
  clusterGeoPoints,
  clusterRadiusForZoom,
  type GeoPoint,
} from "@/lib/map/cluster-photos";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

import { photosWithGps, type TripPhoto } from "./album-types";
import styles from "./trip.module.css";

const GLOBE_TILES =
  // Colorful Carto Voyager (same family as the flat maps). Keep MapLibre `sky`
  // off — atmosphere turns the night hemisphere into opaque white.
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png";

function globeTileUrls(): string[] {
  return ["a", "b", "c", "d"].map((sub) => GLOBE_TILES.replace("{s}", sub));
}

function clusterLocationLabel(photos: readonly TripPhoto[]): string | null {
  const labels = photos
    .map((photo) => photo.locationLabel)
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return null;
  const first = labels[0] ?? null;
  if (!first) return null;
  return labels.every((label) => label === first) ? first : first;
}

function dominantAlbumId(photos: readonly TripPhoto[]): string | null {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    if (!photo.albumId) continue;
    counts.set(photo.albumId, (counts.get(photo.albumId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [albumId, count] of counts) {
    if (count > bestCount) {
      best = albumId;
      bestCount = count;
    }
  }
  return best;
}

/** Folder URL for a pin cluster — same destination as Destaques. */
function folderHrefForPhotos(photos: readonly TripPhoto[]): string | null {
  const albumId = dominantAlbumId(photos);
  if (!albumId) return null;
  const slug =
    photos.find((photo) => photo.albumId === albumId)?.experienceSlug ??
    photos.find((photo) => photo.experienceSlug)?.experienceSlug ??
    null;
  if (!slug) return null;
  return profileTripAlbumPath(slug, albumId);
}

/**
 * Rotatable 3D globe (MapLibre) for the immersive /mapa experience.
 * Leaflet stays for flat trip/profile map embeds.
 * Pin taps open the trip folder directly (no preview sheet).
 */
export function GlobeMapCanvas({
  photos,
  emptyTitle = "Ainda não há localizações no seu mapa.",
  emptyHint = "Importe fotos com GPS para ver o mundo das suas viagens.",
}: {
  readonly photos: readonly TripPhoto[];
  readonly emptyTitle?: string;
  readonly emptyHint?: string | null;
  /** Kept for TripMap API compatibility; unused (pins open the folder). */
  readonly experienceTitle?: string | null;
  readonly albumLabel?: string | null;
  readonly currentAlbumId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [zoom, setZoom] = useState(1.35);
  const [pinThumbs, setPinThumbs] = useState<Readonly<Record<string, string>>>(
    {},
  );

  const geoPoints = useMemo<readonly GeoPoint<TripPhoto>[]>(
    () =>
      photosWithGps(photos).map((photo) => ({
        id: photo.id,
        latitude: photo.exactLatitude as number,
        longitude: photo.exactLongitude as number,
        data: photo,
      })),
    [photos],
  );

  const clusters = useMemo(
    () => clusterGeoPoints(geoPoints, clusterRadiusForZoom(zoom)),
    [geoPoints, zoom],
  );

  const previewPhotoIds = useMemo(
    () =>
      clusters
        .map((cluster) => cluster.points[0]?.data.id)
        .filter((id): id is string => Boolean(id)),
    [clusters],
  );
  const previewPhotoKey = previewPhotoIds.join(",");

  useEffect(() => {
    if (previewPhotoIds.length === 0) return;
    let cancelled = false;
    const createdUrls: string[] = [];

    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        previewPhotoIds.map(async (photoId) => {
          try {
            const blob = await getLocalPhotoBlob(photoId, "thumbnail");
            if (cancelled) return;
            if (blob) {
              const url = URL.createObjectURL(blob);
              createdUrls.push(url);
              next[photoId] = url;
              return;
            }
            next[photoId] =
              `/api/media/${encodeURIComponent(photoId)}?variant=thumbnail`;
          } catch {
            // Pin fallback when blob missing.
          }
        }),
      );
      if (!cancelled) setPinThumbs(next);
    })();

    return () => {
      cancelled = true;
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
  }, [previewPhotoKey, previewPhotoIds]);

  useEffect(() => {
    if (geoPoints.length === 0 || !containerRef.current || mapRef.current) {
      return;
    }

    // Intentionally no `sky` / atmosphere: MapLibre paints the unlit hemisphere
    // white when sky is enabled (known globe quirk). Colorful tiles stay readable.
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        projection: { type: "globe" },
        sources: {
          basemap: {
            type: "raster",
            tiles: globeTileUrls(),
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [
          {
            id: "basemap",
            type: "raster",
            source: "basemap",
            paint: {
              // Slightly mute on the dark stage without bleaching geography.
              "raster-saturation": -0.05,
              "raster-contrast": 0.06,
            },
          },
        ],
      },
      center: [12, 18],
      zoom: 1.35,
      minZoom: 0.6,
      maxZoom: 17,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: false,
        showCompass: false,
      }),
      "top-right",
    );

    map.on("load", () => {
      map.setProjection({ type: "globe" });
      map.resize();
    });

    map.on("zoomend", () => {
      setZoom(map.getZoom());
    });

    // Fit roughly around all points after first paint.
    if (geoPoints.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const point of geoPoints) {
        bounds.extend([point.longitude, point.latitude]);
      }
      map.once("load", () => {
        if (geoPoints.length === 1) {
          const only = geoPoints[0]!;
          map.flyTo({
            center: [only.longitude, only.latitude],
            zoom: 3.2,
            duration: 1200,
          });
        } else {
          map.fitBounds(bounds, {
            padding: 56,
            maxZoom: 3.8,
            duration: 1200,
          });
        }
      });
    }

    mapRef.current = map;

    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- globe lifecycle
  }, [geoPoints.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || geoPoints.length === 0) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    for (const cluster of clusters) {
      const count = cluster.points.length;
      const clusterPhotos = cluster.points.map((point) => point.data);
      const folderHref = folderHrefForPhotos(clusterPhotos);
      const previewId = cluster.points[0]?.data.id;
      const thumbUrl = previewId ? pinThumbs[previewId] : undefined;
      const placeLabel = clusterLocationLabel(clusterPhotos);
      const label = placeLabel
        ? `Abrir pasta: ${placeLabel} (${count} foto${count === 1 ? "" : "s"})`
        : `Abrir pasta (${count} foto${count === 1 ? "" : "s"})`;

      const el = document.createElement("button");
      el.type = "button";
      el.className = thumbUrl ? styles.mapPhotoPin : styles.mapMarker;
      el.setAttribute("aria-label", label);
      if (thumbUrl) {
        el.innerHTML = `<img alt="" draggable="false" src="${thumbUrl.replaceAll('"', "&quot;")}" />${
          count > 1
            ? `<span class="${styles.mapPhotoPinBadge}">${count}</span>`
            : ""
        }`;
      } else {
        el.innerHTML = `<span>${count}</span>`;
      }

      el.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!folderHref) return;
        // Hard navigation matches Destaques / iOS PWA reliability.
        window.location.assign(folderHref);
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: "center",
        // Default is ~0.2 — pins on the far side of the globe show through faintly.
        opacityWhenCovered: 0,
      })
        .setLngLat([cluster.longitude, cluster.latitude])
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [clusters, geoPoints.length, pinThumbs]);

  if (geoPoints.length === 0) {
    return (
      <div className={styles.mapEmptyImmersive}>
        <p>{emptyTitle}</p>
        {emptyHint ? <p className={styles.sectionHint}>{emptyHint}</p> : null}
      </div>
    );
  }

  return (
    <div className={styles.mapLayoutImmersive}>
      <div className={styles.mapFrameImmersive}>
        <div className={styles.mapCanvasImmersive} ref={containerRef} />

        <p className={styles.globeHint} aria-hidden="true">
          Arraste para girar o globo
        </p>
      </div>
    </div>
  );
}

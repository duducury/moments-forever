"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

import { getLocalPhotoBlob } from "@/lib/local-photos/photo-blob-store";
import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";
import {
  boundsFromGeoPoints,
  clusterGeoPoints,
  clusterRadiusForZoom,
  type GeoPoint,
} from "@/lib/map/cluster-photos";

import { PhotoLightbox } from "./album-ui";
import { photosWithGps, type TripPhoto } from "./album-types";
import type {
  TripMapFocus,
  TripMapInitialFit,
  TripMapVariant,
} from "./trip-map";
import styles from "./trip.module.css";

/** Light, non-topographic basemap (no peak/elevation markers). Always light. */
const LIGHT_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const LIGHT_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const LIGHT_TILE_SUBDOMAINS = "abcd";

function MapThumb({
  photo,
  onOpen,
}: {
  readonly photo: TripPhoto;
  readonly onOpen: () => void;
}) {
  const src = useLocalPhotoObjectUrl(photo.id, "thumbnail");
  return (
    <button
      aria-label="Abrir foto"
      className={styles.mapThumbButton}
      onClick={onOpen}
      type="button"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className={styles.mapThumbImage} decoding="async" src={src} />
      ) : (
        <span className={styles.mapThumbFallback} />
      )}
    </button>
  );
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

function flyToSelection(
  map: LeafletMap,
  points: readonly GeoPoint<TripPhoto>[],
  leaflet: typeof import("leaflet"),
) {
  if (points.length === 0) return;
  if (points.length === 1) {
    const point = points[0]!;
    map.flyTo([point.latitude, point.longitude], Math.max(map.getZoom(), 14), {
      duration: 0.85,
    });
    return;
  }

  const bounds = boundsFromGeoPoints(points);
  if (!bounds) return;
  map.flyToBounds(leaflet.latLngBounds(bounds[0], bounds[1]), {
    padding: [56, 56],
    maxZoom: 16,
    duration: 0.85,
  });
}

export function TripMapCanvas({
  photos,
  experienceSlug,
  variant = "full",
  emptyTitle = "Não encontramos localizações nas fotos desta viagem.",
  emptyHint = "Fotos sem GPS continuam disponíveis nos lugares e na aba Fotos.",
  focus = null,
  initialFit = "all",
  currentAlbumId = null,
}: {
  readonly photos: readonly TripPhoto[];
  readonly experienceSlug?: string | null;
  readonly variant?: TripMapVariant;
  readonly emptyTitle?: string;
  readonly emptyHint?: string | null;
  readonly focus?: TripMapFocus | null;
  readonly initialFit?: TripMapInitialFit;
  readonly currentAlbumId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [zoom, setZoom] = useState(variant === "compact" ? 13 : 12);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<readonly string[]>(
    [],
  );
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [pinThumbs, setPinThumbs] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const compact = variant === "compact";
  const featured = variant === "featured";

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

  const photoById = useMemo(() => {
    const map = new Map<string, TripPhoto>();
    for (const photo of photos) {
      map.set(photo.id, photo);
    }
    return map;
  }, [photos]);

  const clusters = useMemo(
    () => clusterGeoPoints(geoPoints, clusterRadiusForZoom(zoom)),
    [geoPoints, zoom],
  );

  const previewPhotoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cluster of clusters) {
      const first = cluster.points[0]?.data.id;
      if (first) ids.add(first);
    }
    return [...ids].sort();
  }, [clusters]);

  const previewPhotoKey = previewPhotoIds.join("|");

  const selectedIdSet = useMemo(
    () => new Set(selectedPhotoIds),
    [selectedPhotoIds],
  );

  const activePhotos = useMemo(
    () =>
      selectedPhotoIds
        .map((id) => photoById.get(id))
        .filter((photo): photo is TripPhoto => Boolean(photo)),
    [photoById, selectedPhotoIds],
  );

  const activePlaceLabel = useMemo(
    () => clusterLocationLabel(activePhotos),
    [activePhotos],
  );

  const openAlbumId = useMemo(
    () => dominantAlbumId(activePhotos),
    [activePhotos],
  );

  const openAlbumHref =
    experienceSlug && openAlbumId && openAlbumId !== currentAlbumId
      ? `/perfil/${encodeURIComponent(experienceSlug)}/album/${openAlbumId}`
      : null;

  const focusLat = focus?.latitude ?? null;
  const focusLng = focus?.longitude ?? null;
  const focusBounds = focus?.bounds ?? null;
  const focusBoundsKey = focusBounds
    ? `${focusBounds[0][0]},${focusBounds[0][1]},${focusBounds[1][0]},${focusBounds[1][1]}`
    : "";

  useEffect(() => {
    if (previewPhotoIds.length === 0) {
      return;
    }

    let cancelled = false;
    const createdUrls: string[] = [];

    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        previewPhotoIds.map(async (photoId) => {
          try {
            const blob = await getLocalPhotoBlob(photoId, "thumbnail");
            if (!blob || cancelled) return;
            const url = URL.createObjectURL(blob);
            createdUrls.push(url);
            next[photoId] = url;
          } catch {
            // Keep pin fallback when local blob is missing.
          }
        }),
      );
      if (!cancelled) {
        setPinThumbs(next);
      }
    })();

    return () => {
      cancelled = true;
      for (const url of createdUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [previewPhotoKey, previewPhotoIds]);

  useEffect(() => {
    if (geoPoints.length === 0 || !containerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = leaflet.map(containerRef.current, {
        scrollWheelZoom: true,
        zoomControl: true,
        touchZoom: true,
        dragging: true,
        attributionControl: true,
      });

      leaflet
        .tileLayer(LIGHT_TILE_URL, {
          attribution: LIGHT_TILE_ATTRIBUTION,
          subdomains: LIGHT_TILE_SUBDOMAINS,
          maxZoom: 20,
        })
        .addTo(map);

      const datasetBounds = boundsFromGeoPoints(geoPoints);
      const padding: [number, number] = compact
        ? [28, 28]
        : featured
          ? [40, 40]
          : [48, 48];

      // Place page: start on the current place. Trip page: show the whole set.
      if (initialFit === "focus" && focusBounds) {
        map.fitBounds(leaflet.latLngBounds(focusBounds[0], focusBounds[1]), {
          padding,
          maxZoom: 16,
        });
      } else if (
        initialFit === "focus" &&
        focusLat !== null &&
        focusLng !== null
      ) {
        map.setView([focusLat, focusLng], featured ? 14 : 13);
      } else if (datasetBounds) {
        map.fitBounds(datasetBounds, {
          padding,
          maxZoom: 15,
        });
      } else {
        map.setView([0, 0], 2);
      }

      setZoom(map.getZoom());
      map.on("zoomend", () => {
        setZoom(map.getZoom());
      });
      map.on("click", () => {
        setSelectedPhotoIds([]);
        setLightboxId(null);
      });

      mapRef.current = map;
      requestAnimationFrame(() => {
        map.invalidateSize();
        window.setTimeout(() => {
          map.invalidateSize();
        }, 120);
      });

      // Trip deep-link: nudge toward a point after the full-dataset fit.
      if (
        initialFit === "all" &&
        focusLat !== null &&
        focusLng !== null
      ) {
        map.flyTo([focusLat, focusLng], compact ? 14 : 13, { duration: 0.7 });
      }
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
    // Recreate only when the GPS set size changes (new import / empty → filled).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Leaflet map lifecycle
  }, [compact, featured, geoPoints.length, initialFit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Init already fitted the place; this runs when focus changes (e.g. another album).
    if (!focusBoundsKey && focusLat === null) return;

    void import("leaflet").then((leaflet) => {
      if (mapRef.current !== map) return;
      const padding: [number, number] = compact
        ? [28, 28]
        : featured
          ? [40, 40]
          : [48, 48];

      if (focusBounds) {
        map.flyToBounds(leaflet.latLngBounds(focusBounds[0], focusBounds[1]), {
          padding,
          maxZoom: 16,
          duration: 0.75,
        });
        return;
      }

      if (focusLat === null || focusLng === null) return;
      map.flyTo([focusLat, focusLng], Math.max(map.getZoom(), 13), {
        duration: 0.75,
      });
    });
    // focusBounds is derived from focusBoundsKey for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid re-flying on new array identity
  }, [compact, featured, focusBoundsKey, focusLat, focusLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || geoPoints.length === 0) return;

    let cancelled = false;

    void import("leaflet").then((leaflet) => {
      if (cancelled || mapRef.current !== map) return;

      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];

      for (const cluster of clusters) {
        const count = cluster.points.length;
        const selected = cluster.points.some((point) =>
          selectedIdSet.has(point.data.id),
        );
        const previewId = cluster.points[0]?.data.id;
        const thumbUrl = previewId ? pinThumbs[previewId] : undefined;
        const placeLabel = clusterLocationLabel(
          cluster.points.map((point) => point.data),
        );
        const label = placeLabel
          ? `${placeLabel}: ${count} foto${count === 1 ? "" : "s"}`
          : `${count} foto${count === 1 ? "" : "s"}`;

        const html = thumbUrl
          ? `<button type="button" class="${styles.mapPhotoPin} ${
              selected ? styles.mapPhotoPinActive : ""
            }" aria-label="${escapeHtmlAttribute(label)}">
              <img alt="" draggable="false" src="${escapeHtmlAttribute(thumbUrl)}" />
              ${
                count > 1
                  ? `<span class="${styles.mapPhotoPinBadge}">${count}</span>`
                  : ""
              }
            </button>`
          : `<button type="button" class="${styles.mapMarker} ${
              selected ? styles.mapMarkerActive : ""
            }" aria-label="${escapeHtmlAttribute(label)}">
              <span>${count}</span>
            </button>`;

        const icon = leaflet.divIcon({
          className: styles.mapMarkerRoot,
          html,
          iconSize: thumbUrl ? [42, 42] : [36, 36],
          iconAnchor: thumbUrl ? [21, 21] : [18, 18],
        });

        const marker = leaflet
          .marker([cluster.latitude, cluster.longitude], { icon })
          .addTo(map);

        marker.on("click", (event) => {
          leaflet.DomEvent.stopPropagation(event);
          const ids = cluster.points.map((point) => point.data.id);
          setSelectedPhotoIds(ids);
          setLightboxId(null);
          flyToSelection(map, cluster.points, leaflet);
        });

        markersRef.current.push(marker);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [clusters, geoPoints.length, pinThumbs, selectedIdSet]);

  const layoutClass = compact
    ? styles.mapLayoutCompact
    : featured
      ? styles.mapLayoutFeatured
      : styles.mapLayout;
  const frameClass = compact
    ? styles.mapFrameCompact
    : featured
      ? styles.mapFrameFeatured
      : styles.mapFrame;
  const canvasClass = compact
    ? styles.mapCanvasCompact
    : featured
      ? styles.mapCanvasFeatured
      : styles.mapCanvas;
  const emptyClass = compact
    ? styles.mapEmptyCompact
    : featured
      ? styles.mapEmptyFeatured
      : styles.mapEmpty;

  if (geoPoints.length === 0) {
    return (
      <div className={emptyClass}>
        <p>{emptyTitle}</p>
        {emptyHint ? <p className={styles.sectionHint}>{emptyHint}</p> : null}
      </div>
    );
  }

  return (
    <div className={layoutClass}>
      <div className={frameClass}>
        <div className={canvasClass} ref={containerRef} />

        {activePhotos.length > 0 ? (
          <aside
            aria-label="Fotos neste local"
            className={styles.mapOverlay}
          >
            <div className={styles.mapOverlayHeader}>
              <div>
                {activePlaceLabel ? (
                  <>
                    <h3 className={styles.mapOverlayTitle}>
                      {activePlaceLabel}
                    </h3>
                    <p className={styles.libraryEyebrow}>
                      {activePhotos.length} foto
                      {activePhotos.length === 1 ? "" : "s"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className={styles.libraryEyebrow}>Local</p>
                    <h3 className={styles.mapOverlayTitle}>
                      {activePhotos.length} foto
                      {activePhotos.length === 1 ? "" : "s"}
                    </h3>
                  </>
                )}
              </div>
              <button
                aria-label="Fechar preview do mapa"
                className={styles.mapOverlayClose}
                onClick={() => {
                  setSelectedPhotoIds([]);
                  setLightboxId(null);
                }}
                type="button"
              >
                Fechar
              </button>
            </div>
            <div className={styles.mapOverlayThumbs}>
              {activePhotos.slice(0, 6).map((photo) => (
                <MapThumb
                  key={photo.id}
                  onOpen={() => setLightboxId(photo.id)}
                  photo={photo}
                />
              ))}
            </div>
            <div className={styles.mapOverlayActions}>
              <button
                className="button secondary"
                onClick={() => {
                  const first = activePhotos[0];
                  if (first) setLightboxId(first.id);
                }}
                type="button"
              >
                Ver fotos
              </button>
              {openAlbumHref ? (
                <Link className="button primary" href={openAlbumHref}>
                  Abrir lugar
                </Link>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {activePhotos.length === 0 && !compact && !featured ? (
        <p className={styles.mapHint}>
          Toque em um ponto para aproximar o mapa e ver as fotos daquele local.
        </p>
      ) : null}

      {lightboxId && activePhotos.length > 0 ? (
        <PhotoLightbox
          onClose={() => setLightboxId(null)}
          onSelect={setLightboxId}
          photoId={lightboxId}
          photos={activePhotos}
        />
      ) : null}
    </div>
  );
}

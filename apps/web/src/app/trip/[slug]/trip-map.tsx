"use client";

import dynamic from "next/dynamic";

import type { TripPhoto } from "./album-types";
import styles from "./trip.module.css";

export type TripMapVariant = "full" | "compact" | "featured" | "immersive";

/** How the map chooses its first camera: whole GPS dataset vs focus place. */
export type TripMapInitialFit = "all" | "focus";

export interface TripMapFocus {
  readonly latitude: number;
  readonly longitude: number;
  /** Optional place bounds [[south, west], [north, east]] for a tight initial fit. */
  readonly bounds?: [[number, number], [number, number]];
}

const TripMapCanvas = dynamic(
  () => import("./trip-map-canvas").then((mod) => mod.TripMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className={styles.mapEmpty}>
        <p>Carregando mapa…</p>
      </div>
    ),
  },
);

const GlobeMapCanvas = dynamic(
  () => import("./globe-map-canvas").then((mod) => mod.GlobeMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className={styles.mapEmptyImmersive}>
        <p>Carregando globo…</p>
      </div>
    ),
  },
);

export function TripMap({
  photos,
  experienceSlug = null,
  experienceTitle = null,
  albumLabel = null,
  variant = "full",
  emptyTitle,
  emptyHint,
  focus = null,
  initialFit = "all",
  currentAlbumId = null,
}: {
  readonly photos: readonly TripPhoto[];
  readonly experienceSlug?: string | null;
  readonly experienceTitle?: string | null;
  readonly albumLabel?: string | null;
  readonly variant?: TripMapVariant;
  readonly emptyTitle?: string;
  readonly emptyHint?: string | null;
  readonly focus?: TripMapFocus | null;
  readonly initialFit?: TripMapInitialFit;
  readonly currentAlbumId?: string | null;
}) {
  if (variant === "immersive") {
    return (
      <GlobeMapCanvas
        albumLabel={albumLabel}
        currentAlbumId={currentAlbumId}
        emptyHint={emptyHint}
        emptyTitle={emptyTitle}
        experienceTitle={experienceTitle}
        photos={photos}
      />
    );
  }

  return (
    <TripMapCanvas
      albumLabel={albumLabel}
      currentAlbumId={currentAlbumId}
      emptyHint={emptyHint}
      emptyTitle={emptyTitle}
      experienceSlug={experienceSlug}
      experienceTitle={experienceTitle}
      focus={focus}
      initialFit={initialFit}
      photos={photos}
      variant={variant}
    />
  );
}

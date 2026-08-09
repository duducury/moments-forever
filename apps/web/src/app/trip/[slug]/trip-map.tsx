"use client";

import dynamic from "next/dynamic";

import type { TripPhoto } from "./album-types";
import styles from "./trip.module.css";

export type TripMapVariant = "full" | "compact" | "featured";

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

export function TripMap({
  photos,
  experienceSlug = null,
  variant = "full",
  emptyTitle,
  emptyHint,
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
  return (
    <TripMapCanvas
      currentAlbumId={currentAlbumId}
      emptyHint={emptyHint}
      emptyTitle={emptyTitle}
      experienceSlug={experienceSlug}
      focus={focus}
      initialFit={initialFit}
      photos={photos}
      variant={variant}
    />
  );
}

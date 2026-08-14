"use client";

import type { TripPhoto } from "@/app/trip/[slug]/album-types";
import { TripMap } from "@/app/trip/[slug]/trip-map";

import styles from "./perfil.module.css";

export function ProfileMap({
  photos,
}: {
  readonly photos: readonly TripPhoto[];
}) {
  const gpsCount = photos.length;

  return (
    <section
      aria-label="Mapa das suas fotos"
      className={styles.mapSection}
      id="mapa"
    >
      <div className={styles.mapHeader}>
        <h2 className={styles.sectionTitle}>Mapa</h2>
        <p className={styles.mapHint}>
          {gpsCount > 0
            ? `${gpsCount} foto${gpsCount === 1 ? "" : "s"} com GPS em todas as viagens`
            : "Nenhuma foto com GPS ainda"}
        </p>
      </div>
      <div className={styles.mapShell}>
        <TripMap
          emptyHint="Fotos sem GPS continuam nas viagens abaixo."
          emptyTitle="Ainda não há localizações no seu perfil."
          photos={photos}
          variant="featured"
        />
      </div>
    </section>
  );
}

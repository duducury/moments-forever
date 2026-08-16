"use client";

import { useEffect, useRef, useState } from "react";

import type { TripPhoto } from "@/app/trip/[slug]/album-types";
import { TripMap } from "@/app/trip/[slug]/trip-map";

import styles from "./perfil.module.css";

export function ProfileMap({
  photos,
}: {
  readonly photos: readonly TripPhoto[];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const gpsCount = photos.length;

  // Map sits below the place grid — wait until near the viewport before
  // pulling MapLibre so Início stays responsive.
  useEffect(() => {
    const node = hostRef.current;
    if (!node || mapReady) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setMapReady(true);
        io.disconnect();
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [mapReady]);

  return (
    <section
      aria-label="Mapa das suas fotos"
      className={styles.mapSection}
      data-reveal
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
      <div className={styles.mapShell} ref={hostRef}>
        {mapReady ? (
          <TripMap
            emptyHint="Fotos sem GPS continuam nas viagens abaixo."
            emptyTitle="Ainda não há localizações no seu perfil."
            photos={photos}
            variant="featured"
          />
        ) : (
          <div aria-hidden className={styles.mapPlaceholder} />
        )}
      </div>
    </section>
  );
}

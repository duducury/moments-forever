"use client";

import type { ProfileCarouselPhoto } from "@/lib/experiences/load-owner-carousel-photos";

import { PolaroidStack } from "./polaroid-stack";
import styles from "./perfil.module.css";

export function ProfileCarousel({
  photos,
}: {
  readonly photos: readonly ProfileCarouselPhoto[];
}) {
  if (photos.length === 0) return null;

  return (
    <section aria-label="Destaques" className={styles.carouselSection} data-reveal>
      <div className={styles.mapHeader}>
        <h2 className={styles.sectionTitle}>Destaques</h2>
      </div>
      <PolaroidStack photos={photos} />
    </section>
  );
}

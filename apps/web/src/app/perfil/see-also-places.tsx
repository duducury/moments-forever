"use client";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";

import { ProfilePlaceCard } from "./profile-place-card";
import styles from "./perfil.module.css";

export function SeeAlsoPlaces({
  places,
}: {
  readonly places: readonly OwnerPlaceCardItem[];
}) {
  if (places.length === 0) return null;

  return (
    <section aria-label="Outras viagens" className={styles.seeAlso}>
      <h2 className={styles.seeAlsoTitle}>
        Veja também a minha viagem para:
      </h2>
      <ul className={styles.seeAlsoTrack}>
        {places.map((place) => (
          <li className={styles.seeAlsoItem} key={place.albumId}>
            <ProfilePlaceCard isOwner={false} place={place} />
          </li>
        ))}
      </ul>
    </section>
  );
}

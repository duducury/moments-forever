"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  confirmRemoveTripLocation,
  removeLocationFromExperience,
} from "@/lib/privacy/remove-location";

import styles from "./privacy.module.css";

interface PrivacyAlbum {
  readonly id: string;
  readonly name: string;
  readonly photoCount: number;
  readonly locatedCount: number;
}

interface PrivacyTrip {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly locatedCount: number;
  readonly photoCount: number;
  readonly albums: readonly PrivacyAlbum[];
}

export function PrivacyTripsClient({
  trips: initialTrips,
}: {
  readonly trips: readonly PrivacyTrip[];
}) {
  const router = useRouter();
  const [trips, setTrips] = useState(initialTrips);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRemoveTrip(trip: PrivacyTrip) {
    if (trip.locatedCount === 0) return;
    if (!confirmRemoveTripLocation()) return;
    setBusyId(trip.id);
    setError(null);
    try {
      await removeLocationFromExperience(trip.id);
      setTrips((current) =>
        current.map((item) =>
          item.id === trip.id
            ? {
                ...item,
                locatedCount: 0,
                albums: item.albums.map((album) => ({
                  ...album,
                  locatedCount: 0,
                })),
              }
            : item,
        ),
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao remover localização.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (trips.length === 0) {
    return <p className={styles.empty}>Você ainda não tem viagens.</p>;
  }

  return (
    <div>
      {error ? (
        <p className="placeholder-note" role="alert">
          {error}
        </p>
      ) : null}
      <ul className={styles.list}>
        {trips.map((trip) => (
          <li className={styles.tripCard} key={trip.id}>
            <div>
              <p className={styles.tripTitle}>{trip.title}</p>
              <p className={styles.tripMeta}>
                {trip.photoCount} foto{trip.photoCount === 1 ? "" : "s"}
                {" · "}
                {trip.locatedCount > 0
                  ? `${trip.locatedCount} com localização`
                  : "sem localização no mapa"}
              </p>
            </div>

            {trip.albums.length > 0 ? (
              <ul className={styles.albumList} aria-label={`Lugares de ${trip.title}`}>
                {trip.albums.map((album) => (
                  <li className={styles.albumRow} key={album.id}>
                    <div className={styles.albumCopy}>
                      <p className={styles.albumName}>{album.name}</p>
                      <p className={styles.albumMeta}>
                        {album.photoCount} foto
                        {album.photoCount === 1 ? "" : "s"}
                        {" · "}
                        {album.locatedCount > 0
                          ? `${album.locatedCount} com localização`
                          : "sem GPS"}
                      </p>
                    </div>
                    <Link
                      className="button primary"
                      href={`/perfil/${encodeURIComponent(trip.slug)}/album/${album.id}?privacy=1`}
                    >
                      Escolher fotos
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.albumMeta}>Nenhum lugar nesta viagem ainda.</p>
            )}

            <div className={styles.tripActions}>
              <button
                className="button secondary"
                disabled={busyId !== null || trip.locatedCount === 0}
                onClick={() => void onRemoveTrip(trip)}
                type="button"
              >
                {busyId === trip.id
                  ? "Removendo…"
                  : "Remover localização de toda a viagem"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

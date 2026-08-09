"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  confirmRemoveTripLocation,
  removeLocationFromExperience,
} from "@/lib/privacy/remove-location";

interface PrivacyTrip {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly locatedCount: number;
  readonly photoCount: number;
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
          item.id === trip.id ? { ...item, locatedCount: 0 } : item,
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
    return (
      <p style={{ marginTop: 18, color: "var(--muted)" }}>
        Você ainda não tem viagens.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
      {error ? (
        <p className="placeholder-note" role="alert">
          {error}
        </p>
      ) : null}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {trips.map((trip) => (
          <li
            key={trip.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "14px 16px",
              background: "color-mix(in srgb, var(--surface) 92%, transparent)",
              display: "grid",
              gap: 10,
            }}
          >
            <div>
              <Link className="text-link" href={`/trip/${trip.slug}`}>
                {trip.title}
              </Link>
              <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.92rem" }}>
                {trip.photoCount} foto{trip.photoCount === 1 ? "" : "s"}
                {" · "}
                {trip.locatedCount > 0
                  ? `${trip.locatedCount} com localização`
                  : "sem localização no mapa"}
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
              <Link className="button secondary" href={`/trip/${trip.slug}`}>
                Abrir viagem
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

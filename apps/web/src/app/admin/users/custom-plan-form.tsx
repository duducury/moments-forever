"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import styles from "../admin.module.css";

export interface CustomPlanValues {
  readonly maxTrips: number;
  readonly maxPhotosPerTrip: number;
  readonly maxNfcTags: number;
  readonly active: boolean;
}

/**
 * Admin-only editor for one user's custom plan. The numbers are only a request:
 * the server validates them and checks the caller is an admin before anything
 * is written (see /api/admin/users/[id]/custom-plan).
 */
export function CustomPlanForm({
  userId,
  current,
  onDone,
}: {
  readonly userId: string;
  readonly current: CustomPlanValues | null;
  readonly onDone?: () => void;
}) {
  const router = useRouter();
  const [trips, setTrips] = useState(String(current?.maxTrips ?? ""));
  const [photos, setPhotos] = useState(String(current?.maxPhotosPerTrip ?? ""));
  const [nfc, setNfc] = useState(String(current?.maxNfcTags ?? ""));
  const [active, setActive] = useState(current?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numbers = [trips, photos, nfc].map((value) => (value.trim() === "" ? NaN : Number(value)));
    if (numbers.some((value) => !Number.isInteger(value) || value < 0)) {
      setMessage("Preencha viagens, fotos por viagem e tags NFC com números inteiros.");
      return;
    }
    if (
      !window.confirm(
        "Isso substitui as licenças ativas desta conta pelo plano personalizado. Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/custom-plan`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          maxTrips: numbers[0],
          maxPhotosPerTrip: numbers[1],
          maxNfcTags: numbers[2],
          active,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { readonly error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao salvar o plano personalizado.");
      setMessage("Plano personalizado salvo.");
      router.refresh();
      onDone?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar o plano personalizado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.customPlanForm} onSubmit={(event) => void onSubmit(event)}>
      <p className={styles.customPlanTitle}>Plano personalizado</p>
      <label>
        <span>Viagens</span>
        <input disabled={busy} inputMode="numeric" min={0} onChange={(e) => setTrips(e.target.value)} type="number" value={trips} />
      </label>
      <label>
        <span>Fotos por viagem</span>
        <input disabled={busy} inputMode="numeric" min={0} onChange={(e) => setPhotos(e.target.value)} type="number" value={photos} />
      </label>
      <label>
        <span>Tags NFC</span>
        <input disabled={busy} inputMode="numeric" min={0} onChange={(e) => setNfc(e.target.value)} type="number" value={nfc} />
      </label>
      <label className={styles.customPlanCheck}>
        <input checked={active} disabled={busy} onChange={(e) => setActive(e.target.checked)} type="checkbox" />
        <span>Ativo</span>
      </label>
      <button className="button primary" disabled={busy} type="submit">
        Salvar plano personalizado
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

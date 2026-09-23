"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import styles from "../admin.module.css";

interface PlanRow {
  readonly id: string;
  readonly name: string;
  readonly maxNfcTags: number;
  readonly maxPhotosPerTrip: number;
  readonly active: boolean;
}

export function PlanEditForm({ plan }: { readonly plan: PlanRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          max_nfc_tags: Number(data.get("max_nfc_tags")),
          max_photos_per_trip: Number(data.get("max_photos_per_trip")),
          active: data.get("active") === "on",
        }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível salvar.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={`${styles.panel} ${styles.formRow}`}
      onSubmit={(e) => void onSubmit(e)}
    >
      <div className={styles.formField}>
        <label htmlFor={`nfc-${plan.id}`}>
          {plan.name} — Limite de viagens
        </label>
        <input
          defaultValue={plan.maxNfcTags}
          id={`nfc-${plan.id}`}
          min={0}
          name="max_nfc_tags"
          type="number"
        />
      </div>
      <div className={styles.formField}>
        <label htmlFor={`photos-${plan.id}`}>Max fotos/viagem</label>
        <input
          defaultValue={plan.maxPhotosPerTrip}
          id={`photos-${plan.id}`}
          min={0}
          name="max_photos_per_trip"
          type="number"
        />
      </div>
      <div className={styles.formField}>
        <label htmlFor={`active-${plan.id}`}>Ativo</label>
        <input
          defaultChecked={plan.active}
          id={`active-${plan.id}`}
          name="active"
          type="checkbox"
        />
      </div>
      <button className="button primary" disabled={busy} type="submit">
        {busy ? "Salvando…" : "Salvar"}
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </form>
  );
}

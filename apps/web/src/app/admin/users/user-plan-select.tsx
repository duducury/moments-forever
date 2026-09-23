"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "../admin.module.css";

interface PlanOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Admin override action — always a reset ("definir plano"), never a
 * reflection of "the" current plan, since a user can hold several active
 * licenses at once (activation codes stack). Selecting here revokes all of
 * a user's active licenses and grants exactly this one plan instead.
 */
export function UserPlanSelect({
  userId,
  plans,
  onDone,
}: {
  readonly userId: string;
  readonly plans: readonly PlanOption[];
  readonly onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(planId: string) {
    if (!planId) return;
    if (
      !window.confirm(
        "Isso substitui todas as licenças ativas desta conta por este único plano. Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao definir plano.");
      }
      router.refresh();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao definir plano.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <select
        aria-label="Definir plano (substitui as licenças atuais)"
        className={styles.inlineSelect}
        disabled={busy}
        onChange={(event) => {
          void onChange(event.target.value);
          event.target.value = "";
        }}
        value=""
      >
        <option value="">Definir plano…</option>
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name}
          </option>
        ))}
      </select>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

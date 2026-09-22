"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "../admin.module.css";

interface PlanOption {
  readonly id: string;
  readonly name: string;
}

export function UserPlanSelect({
  userId,
  currentPlanId,
  plans,
}: {
  readonly userId: string;
  readonly currentPlanId: string | null;
  readonly plans: readonly PlanOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(planId: string) {
    if (!planId || planId === currentPlanId) return;
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
        throw new Error(payload.error ?? "Falha ao alterar plano.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar plano.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <select
        aria-label="Alterar plano"
        className={styles.inlineSelect}
        defaultValue={currentPlanId ?? ""}
        disabled={busy}
        onChange={(event) => void onChange(event.target.value)}
      >
        <option disabled value="">
          Sem plano
        </option>
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

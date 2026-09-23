"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import styles from "../admin.module.css";

export interface PlanRow {
  readonly id: string;
  readonly name: string;
  readonly maxNfcTags: number;
  readonly maxPhotosPerTrip: number;
  readonly active: boolean;
  readonly priceLabel: string | null;
  readonly priceNote: string;
  readonly highlight: boolean;
}

interface PlanDraft {
  readonly maxNfcTags: number;
  readonly maxPhotosPerTrip: number;
  readonly active: boolean;
  readonly priceLabel: string;
  readonly priceNote: string;
  readonly highlight: boolean;
}

const PLAN_TONE: Record<string, string> = {
  BASIC: "success",
  PLUS: "info",
  PREMIUM: "premium",
  LEGACY: "gold",
};

function draftFrom(plan: PlanRow): PlanDraft {
  return {
    maxNfcTags: plan.maxNfcTags,
    maxPhotosPerTrip: plan.maxPhotosPerTrip,
    active: plan.active,
    priceLabel: plan.priceLabel ?? "",
    priceNote: plan.priceNote,
    highlight: plan.highlight,
  };
}

function isDirty(plan: PlanRow, draft: PlanDraft): boolean {
  return (
    plan.maxNfcTags !== draft.maxNfcTags ||
    plan.maxPhotosPerTrip !== draft.maxPhotosPerTrip ||
    plan.active !== draft.active ||
    (plan.priceLabel ?? "") !== draft.priceLabel ||
    plan.priceNote !== draft.priceNote ||
    plan.highlight !== draft.highlight
  );
}

function PlanCard({
  plan,
  draft,
  dirty,
  onChange,
}: {
  readonly plan: PlanRow;
  readonly draft: PlanDraft;
  readonly dirty: boolean;
  readonly onChange: (patch: Partial<PlanDraft>) => void;
}) {
  return (
    <div className={styles.planCard} data-dirty={dirty ? "true" : undefined}>
      <div className={styles.planCardHeader}>
        <span className={styles.planCardName} data-tone={PLAN_TONE[plan.name] ?? "neutral"}>
          {plan.name}
        </span>
        <label className={styles.planActiveToggle}>
          <input
            checked={draft.active}
            onChange={(event) => onChange({ active: event.target.checked })}
            type="checkbox"
          />
          <span className={styles.planActiveDot} data-on={draft.active ? "true" : "false"} />
          Ativo
        </label>
      </div>

      <div className={styles.planCardField}>
        <label htmlFor={`nfc-${plan.id}`}>Limite de viagens</label>
        <input
          id={`nfc-${plan.id}`}
          min={0}
          onChange={(event) => onChange({ maxNfcTags: Number(event.target.value) })}
          type="number"
          value={draft.maxNfcTags}
        />
      </div>

      <div className={styles.planCardField}>
        <label htmlFor={`photos-${plan.id}`}>Máx fotos/viagem</label>
        <input
          id={`photos-${plan.id}`}
          min={0}
          onChange={(event) =>
            onChange({ maxPhotosPerTrip: Number(event.target.value) })
          }
          type="number"
          value={draft.maxPhotosPerTrip}
        />
      </div>

      <p className={styles.planCardSectionLabel}>Vitrine na home (deslogado)</p>

      <div className={styles.planCardField}>
        <label htmlFor={`price-${plan.id}`}>Preço exibido</label>
        <input
          id={`price-${plan.id}`}
          onChange={(event) => onChange({ priceLabel: event.target.value })}
          placeholder="Ex: US$ 8"
          type="text"
          value={draft.priceLabel}
        />
      </div>

      <div className={styles.planCardField}>
        <label htmlFor={`price-note-${plan.id}`}>Texto abaixo do preço</label>
        <input
          id={`price-note-${plan.id}`}
          onChange={(event) => onChange({ priceNote: event.target.value })}
          placeholder="Ex: pagamento único"
          type="text"
          value={draft.priceNote}
        />
      </div>

      <label className={`${styles.planActiveToggle} ${styles.planCardHighlightToggle}`}>
        <input
          checked={draft.highlight}
          onChange={(event) => onChange({ highlight: event.target.checked })}
          type="checkbox"
        />
        <span className={styles.planActiveDot} data-on={draft.highlight ? "true" : "false"} />
        Destacar como &quot;Mais popular&quot;
      </label>
    </div>
  );
}

/**
 * One "Salvar alterações" for every plan card instead of a submit button
 * repeated per card. The underlying save is still one PATCH per plan
 * (/api/admin/plans/[id]) — only dirty plans are sent when clicked.
 */
export function PlansEditor({ plans }: { readonly plans: readonly PlanRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>(() =>
    Object.fromEntries(plans.map((plan) => [plan.id, draftFrom(plan)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirtyIds = useMemo(
    () =>
      plans
        .filter((plan) => {
          const draft = drafts[plan.id];
          return draft ? isDirty(plan, draft) : false;
        })
        .map((plan) => plan.id),
    [plans, drafts],
  );

  function updateDraft(planId: string, patch: Partial<PlanDraft>) {
    setDrafts((current) => ({
      ...current,
      [planId]: { ...current[planId]!, ...patch },
    }));
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      const results = await Promise.all(
        dirtyIds.map(async (planId) => {
          const draft = drafts[planId]!;
          const response = await fetch(`/api/admin/plans/${planId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              max_nfc_tags: draft.maxNfcTags,
              max_photos_per_trip: draft.maxPhotosPerTrip,
              active: draft.active,
              price_label: draft.priceLabel.trim() === "" ? null : draft.priceLabel.trim(),
              price_note: draft.priceNote,
              highlight: draft.highlight,
            }),
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(payload.error ?? "Não foi possível salvar um plano.");
          }
        }),
      );
      void results;
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar planos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.plansEditorWrap}>
      <div className={styles.planGrid}>
        {plans.map((plan) => {
          const draft = drafts[plan.id];
          if (!draft) return null;
          return (
            <PlanCard
              dirty={dirtyIds.includes(plan.id)}
              draft={draft}
              key={plan.id}
              onChange={(patch) => updateDraft(plan.id, patch)}
              plan={plan}
            />
          );
        })}
      </div>
      <div className={styles.plansSaveBar}>
        {error ? (
          <p className={styles.plansSaveError} role="alert">
            {error}
          </p>
        ) : (
          <p className={styles.subtitle}>
            {dirtyIds.length > 0
              ? `${dirtyIds.length} plano${dirtyIds.length === 1 ? "" : "s"} com alterações não salvas.`
              : "Nenhuma alteração pendente."}
          </p>
        )}
        <button
          className="button primary"
          disabled={saving || dirtyIds.length === 0}
          onClick={() => void saveAll()}
          type="button"
        >
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { publicProfilePath } from "@/lib/profile/profile-slug";

import styles from "../admin.module.css";

interface PlanOption {
  readonly id: string;
  readonly name: string;
}

interface CodeRow {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly planName: string;
  readonly userLabel: string | null;
  readonly userProfileSlug: string | null;
  readonly createdAt: string;
}

interface Counts {
  readonly available: number;
  readonly activated: number;
  readonly revoked: number;
}

const STATUS_LABEL: Record<string, string> = {
  available: "Disponível",
  activated: "Em uso",
  revoked: "Revogado",
};

const STATUS_TONE: Record<string, "success" | "accent" | "danger"> = {
  available: "success",
  activated: "accent",
  revoked: "danger",
};

export function CodesClient({ plans }: { readonly plans: readonly PlanOption[] }) {
  const [codes, setCodes] = useState<readonly CodeRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState<{
    readonly codes: readonly string[];
    readonly planName: string;
  } | null>(null);

  async function loadCodes() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/codes");
      const payload = (await response.json()) as {
        codes?: readonly CodeRow[];
        counts?: Counts;
      };
      setCodes(payload.codes ?? []);
      setCounts(payload.counts ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/codes");
        const payload = (await response.json()) as {
          codes?: readonly CodeRow[];
          counts?: Counts;
        };
        if (!cancelled) {
          setCodes(payload.codes ?? []);
          setCounts(payload.counts ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setJustGenerated(null);
    try {
      const response = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity, planId }),
      });
      const payload = (await response.json()) as {
        readonly error?: string;
        readonly codes?: readonly string[];
        readonly planName?: string;
      };
      if (!response.ok || !payload.codes) {
        throw new Error(payload.error ?? "Não foi possível gerar códigos.");
      }
      setJustGenerated({ codes: payload.codes, planName: payload.planName ?? "" });
      await loadCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar códigos.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt("Copie o código:", text);
    }
  }

  return (
    <>
      {counts ? (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <p className={styles.statValue}>{counts.available}</p>
            <p className={styles.statLabel}>Disponíveis</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statValue}>{counts.activated}</p>
            <p className={styles.statLabel}>Em uso</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statValue}>{counts.revoked}</p>
            <p className={styles.statLabel}>Revogados</p>
          </div>
        </div>
      ) : null}

      <div className={styles.panel}>
        <form className={styles.formRow} onSubmit={(e) => void onGenerate(e)}>
          <div className={styles.formField}>
            <label htmlFor="quantity">Quantidade</label>
            <input
              id="quantity"
              max={1000}
              min={1}
              onChange={(e) => setQuantity(Number(e.target.value))}
              type="number"
              value={quantity}
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor="planId">Plano</label>
            <select
              id="planId"
              onChange={(e) => setPlanId(e.target.value)}
              value={planId}
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <button className="button primary" disabled={busy} type="submit">
            {busy
              ? "Gerando…"
              : quantity === 1
                ? "Gerar código"
                : `Gerar ${quantity} códigos`}
          </button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
      </div>

      {justGenerated ? (
        <div className={styles.freshCodes}>
          <p className={styles.freshCodesTitle}>
            {justGenerated.codes.length === 1
              ? "Código gerado — plano " + justGenerated.planName
              : `${justGenerated.codes.length} códigos gerados — plano ${justGenerated.planName}`}
          </p>
          <ul className={styles.freshCodesList}>
            {justGenerated.codes.map((code) => (
              <li key={code}>
                <button
                  className={styles.codeCopy}
                  onClick={() => void copyText(`fresh-${code}`, code)}
                  type="button"
                >
                  {copiedId === `fresh-${code}` ? "Copiado ✓" : code}
                </button>
              </li>
            ))}
          </ul>
          {justGenerated.codes.length > 1 ? (
            <button
              className="button secondary"
              onClick={() =>
                void copyText("fresh-all", justGenerated.codes.join("\n"))
              }
              type="button"
            >
              {copiedId === "fresh-all" ? "Copiado ✓" : "Copiar todos"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Plano</th>
              <th>Status</th>
              <th>Usuário</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Carregando…</td>
              </tr>
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum código gerado ainda.</td>
              </tr>
            ) : (
              codes.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      className={styles.codeCopy}
                      onClick={() => void copyText(row.id, row.code)}
                      type="button"
                    >
                      {copiedId === row.id ? "Copiado" : row.code}
                    </button>
                  </td>
                  <td>{row.planName}</td>
                  <td>
                    <span
                      className={styles.badge}
                      data-tone={STATUS_TONE[row.status] ?? "neutral"}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td>
                    {row.userLabel ? (
                      row.userProfileSlug ? (
                        <Link
                          className="text-link"
                          href={publicProfilePath(row.userProfileSlug)}
                          target="_blank"
                        >
                          {row.userLabel}
                        </Link>
                      ) : (
                        row.userLabel
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{new Date(row.createdAt).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

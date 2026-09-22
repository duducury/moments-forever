"use client";

import { useEffect, useState, type FormEvent } from "react";

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
  readonly createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  available: "Disponível",
  activated: "Ativado",
  revoked: "Revogado",
};

export function CodesClient({ plans }: { readonly plans: readonly PlanOption[] }) {
  const [codes, setCodes] = useState<readonly CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(100);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function loadCodes() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/codes");
      const payload = (await response.json()) as { codes?: readonly CodeRow[] };
      setCodes(payload.codes ?? []);
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
        };
        if (!cancelled) setCodes(payload.codes ?? []);
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
    try {
      const response = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity, planId }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível gerar códigos.");
      }
      await loadCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar códigos.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt("Copie o código:", code);
    }
  }

  return (
    <>
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
          {busy ? "Gerando…" : "Gerar códigos"}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}

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
                      onClick={() => void copyCode(row.id, row.code)}
                      type="button"
                    >
                      {copiedId === row.id ? "Copiado" : row.code}
                    </button>
                  </td>
                  <td>{row.planName}</td>
                  <td>{STATUS_LABEL[row.status] ?? row.status}</td>
                  <td>{row.userLabel ?? "—"}</td>
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

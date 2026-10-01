"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { publicProfilePath } from "@/lib/profile/profile-slug";

import styles from "../admin.module.css";

interface ReportRow {
  readonly id: string;
  readonly reporterLabel: string;
  readonly reporterProfileSlug: string | null;
  readonly targetType: string;
  readonly targetId: string;
  readonly reason: string;
  readonly details: string | null;
  readonly status: string;
  readonly createdAt: string;
}

const TARGET_TYPE_LABEL: Record<string, string> = {
  user: "Usuário",
  experience: "Viagem",
  album: "Álbum",
  photo: "Foto",
};

const REASON_LABEL: Record<string, string> = {
  offensive: "Conteúdo ofensivo",
  illegal: "Conteúdo ilegal",
  spam: "Spam",
  inappropriate: "Conteúdo inadequado",
  other: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  reviewing: "Em análise",
  resolved: "Resolvido",
  dismissed: "Ignorado",
};

const STATUS_TONE: Record<string, "success" | "accent" | "danger" | "neutral"> = {
  open: "danger",
  reviewing: "accent",
  resolved: "success",
  dismissed: "neutral",
};

export function ReportsClient() {
  const [reports, setReports] = useState<readonly ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/reports");
      const payload = (await response.json()) as { reports?: readonly ReportRow[] };
      setReports(payload.reports ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/reports");
        const payload = (await response.json()) as {
          reports?: readonly ReportRow[];
        };
        if (!cancelled) setReports(payload.reports ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateStatus(row: ReportRow, status: string) {
    setUpdatingId(row.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/reports/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível atualizar a denúncia.");
      }
      await loadReports();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao atualizar denúncia.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Conteúdo</th>
              <th>Denunciado por</th>
              <th>Motivo</th>
              <th>Detalhes</th>
              <th>Data</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>Carregando…</td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhuma denúncia registrada.</td>
              </tr>
            ) : (
              reports.map((row) => (
                <tr key={row.id}>
                  <td>
                    {TARGET_TYPE_LABEL[row.targetType] ?? row.targetType}
                    <br />
                    <code>{row.targetId.slice(0, 8)}</code>
                  </td>
                  <td>
                    {row.reporterProfileSlug ? (
                      <Link
                        className="text-link"
                        href={publicProfilePath(row.reporterProfileSlug)}
                        target="_blank"
                      >
                        {row.reporterLabel}
                      </Link>
                    ) : (
                      row.reporterLabel
                    )}
                  </td>
                  <td>{REASON_LABEL[row.reason] ?? row.reason}</td>
                  <td>{row.details || "—"}</td>
                  <td>{new Date(row.createdAt).toLocaleDateString("pt-BR")}</td>
                  <td>
                    <span
                      className={styles.badge}
                      data-tone={STATUS_TONE[row.status] ?? "neutral"}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td>
                    <select
                      disabled={updatingId === row.id}
                      onChange={(event) => void updateStatus(row, event.target.value)}
                      value={row.status}
                    >
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

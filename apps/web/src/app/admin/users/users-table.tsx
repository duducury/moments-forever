"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { publicProfilePath } from "@/lib/profile/profile-slug";

import styles from "../admin.module.css";
import { UserPlanSelect } from "./user-plan-select";

export interface UserRow {
  readonly id: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly profileSlug: string | null;
  readonly isAdmin: boolean;
  readonly createdAt: string;
  readonly tripsUsed: number;
  readonly tripsLimit: number;
  readonly photoCount: number;
  readonly plans: readonly { readonly name: string; readonly count: number }[];
}

interface PlanOption {
  readonly id: string;
  readonly name: string;
}

const PLAN_TONE: Record<string, string> = {
  BASIC: "success",
  PLUS: "info",
  PREMIUM: "premium",
  LEGACY: "neutral",
};

const AVATAR_COLORS = [
  "#8b3f28",
  "#3b7ec4",
  "#3f9b5a",
  "#8a5fc4",
  "#c0503e",
  "#b08a2e",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function matchesQuery(row: UserRow, query: string): boolean {
  const haystack = [row.displayName, row.email, row.profileSlug]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function UsersTable({
  rows,
  plans,
}: {
  readonly rows: readonly UserRow[];
  readonly plans: readonly PlanOption[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return rows;
    return rows.filter((row) => matchesQuery(row, trimmed));
  }, [rows, query]);

  return (
    <>
      <div className={styles.searchRow}>
        <input
          aria-label="Buscar por nome ou e-mail"
          className={styles.searchInput}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          type="search"
          value={query}
        />
        {query ? (
          <p className={styles.searchCount}>
            {filtered.length} de {rows.length}
          </p>
        ) : null}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Plano</th>
              <th>Viagens</th>
              <th>Fotos</th>
              <th>Criado em</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9}>Nenhum usuário encontrado.</td>
              </tr>
            ) : (
              filtered.map((row, index) => (
                <tr key={row.id}>
                  <td className={styles.rowNumber}>{index + 1}</td>
                  <td>
                    <div className={styles.userCell}>
                      <span
                        className={styles.avatar}
                        style={{ background: avatarColor(row.id) }}
                      >
                        {(row.displayName || row.email || row.profileSlug || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      {row.displayName || row.profileSlug || row.id.slice(0, 8)}
                    </div>
                  </td>
                  <td className={styles.emailCell}>{row.email ?? "—"}</td>
                  <td>
                    <div className={styles.planBadges}>
                      {row.plans.length > 0 ? (
                        row.plans.map((plan) => (
                          <span
                            className={styles.badge}
                            data-tone={PLAN_TONE[plan.name] ?? "neutral"}
                            key={plan.name}
                          >
                            {plan.name}
                            {plan.count > 1 ? ` ×${plan.count}` : ""}
                          </span>
                        ))
                      ) : (
                        <span className={styles.badge} data-tone="neutral">
                          Sem licença
                        </span>
                      )}
                    </div>
                    <UserPlanSelect plans={plans} userId={row.id} />
                  </td>
                  <td>
                    {row.tripsUsed}/{row.tripsLimit}
                  </td>
                  <td>{row.photoCount}</td>
                  <td>
                    {new Date(row.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td>
                    <span
                      className={styles.badge}
                      data-tone={row.isAdmin ? "accent" : "neutral"}
                    >
                      {row.isAdmin ? "Admin" : "Ativo"}
                    </span>
                  </td>
                  <td>
                    {row.profileSlug ? (
                      <Link
                        className="text-link"
                        href={publicProfilePath(row.profileSlug)}
                        target="_blank"
                      >
                        Ver perfil
                      </Link>
                    ) : null}
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

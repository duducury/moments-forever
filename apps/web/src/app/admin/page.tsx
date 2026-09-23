import Link from "next/link";
import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

import { AdminNav } from "./admin-nav";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

interface StatCard {
  readonly label: string;
  readonly value: number;
  readonly icon: string;
  readonly href?: string;
}

export default async function AdminDashboardPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect(profilePath());
  const { supabase } = admin;

  const [
    users,
    licenses,
    codesAvailable,
    codesActivated,
    nfcTags,
    recentUsers,
    recentCodes,
  ] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("activation_codes")
      .select("id", { count: "exact", head: true })
      .eq("status", "available"),
    supabase
      .from("activation_codes")
      .select("id", { count: "exact", head: true })
      .eq("status", "activated"),
    supabase.from("nfc_tags").select("id", { count: "exact", head: true }),
    supabase
      .from("users")
      .select("id, display_name, profile_slug, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("activation_codes")
      .select("code, status, created_at, plans(name)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const stats: readonly StatCard[] = [
    { label: "Usuários", value: users.count ?? 0, icon: "👤", href: "/admin/users" },
    {
      label: "Licenças ativas",
      value: licenses.count ?? 0,
      icon: "🔑",
      href: "/admin/users",
    },
    {
      label: "Códigos disponíveis",
      value: codesAvailable.count ?? 0,
      icon: "🎫",
      href: "/admin/codes",
    },
    {
      label: "Códigos ativados",
      value: codesActivated.count ?? 0,
      icon: "✅",
      href: "/admin/codes",
    },
    { label: "Tags NFC criadas", value: nfcTags.count ?? 0, icon: "📡" },
  ];

  const CODE_STATUS_LABEL: Record<string, string> = {
    available: "Disponível",
    activated: "Em uso",
    revoked: "Revogado",
  };
  const CODE_STATUS_TONE: Record<string, string> = {
    available: "success",
    activated: "accent",
    revoked: "danger",
  };

  return (
    <main className={`page-shell ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin</h1>
          <p className={styles.subtitle}>Moments Forever</p>
        </div>
      </div>
      <AdminNav active="dashboard" />

      <div className={styles.quickActions}>
        <Link className="button primary" href="/admin/codes">
          + Gerar código
        </Link>
        <Link className="button secondary" href="/admin/users">
          Ver usuários
        </Link>
        <Link className="button secondary" href="/admin/plans">
          Editar planos
        </Link>
      </div>

      <div className={styles.statsGrid}>
        {stats.map((stat) =>
          stat.href ? (
            <Link className={styles.statCardLink} href={stat.href} key={stat.label}>
              <span className={styles.statIcon}>{stat.icon}</span>
              <p className={styles.statValue}>{stat.value}</p>
              <p className={styles.statLabel}>{stat.label}</p>
            </Link>
          ) : (
            <div className={styles.statCard} key={stat.label}>
              <span className={styles.statIcon}>{stat.icon}</span>
              <p className={styles.statValue}>{stat.value}</p>
              <p className={styles.statLabel}>{stat.label}</p>
            </div>
          ),
        )}
      </div>

      <div className={styles.dashboardColumns}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.sectionTitle}>Usuários recentes</h2>
            <Link className="text-link" href="/admin/users">
              Ver todos
            </Link>
          </div>
          {(recentUsers.data ?? []).length === 0 ? (
            <p className={styles.subtitle}>Nenhum usuário ainda.</p>
          ) : (
            <ul className={styles.miniList}>
              {(recentUsers.data ?? []).map((user) => (
                <li className={styles.miniListItem} key={user.id as string}>
                  <span>
                    {(user.display_name as string | null) ||
                      (user.profile_slug as string | null) ||
                      (user.id as string).slice(0, 8)}
                  </span>
                  <span className={styles.miniListMeta}>
                    {new Date(user.created_at as string).toLocaleDateString(
                      "pt-BR",
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.sectionTitle}>Códigos recentes</h2>
            <Link className="text-link" href="/admin/codes">
              Ver todos
            </Link>
          </div>
          {(recentCodes.data ?? []).length === 0 ? (
            <p className={styles.subtitle}>Nenhum código gerado ainda.</p>
          ) : (
            <ul className={styles.miniList}>
              {(recentCodes.data ?? []).map((code) => {
                const planRow = code.plans as { name?: string } | { name?: string }[] | null;
                const planName = Array.isArray(planRow)
                  ? (planRow[0]?.name ?? "—")
                  : (planRow?.name ?? "—");
                return (
                  <li className={styles.miniListItem} key={code.code as string}>
                    <span className={styles.codeCopy}>{code.code as string}</span>
                    <span className={styles.miniListMeta}>{planName}</span>
                    <span
                      className={styles.badge}
                      data-tone={
                        CODE_STATUS_TONE[code.status as string] ?? "neutral"
                      }
                    >
                      {CODE_STATUS_LABEL[code.status as string] ??
                        (code.status as string)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

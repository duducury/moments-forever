import Link from "next/link";
import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

interface StatCard {
  readonly label: string;
  readonly value: number;
  readonly icon: string;
  readonly tone: string;
  readonly href?: string;
}

function firstName(fullName: string | null, email: string | undefined): string {
  const source = fullName?.trim() || email?.split("@")[0] || "";
  return source.split(/\s+/)[0] || "Admin";
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
    adminProfile,
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
    supabase
      .from("users")
      .select("display_name, profile_slug")
      .eq("id", admin.user.id)
      .maybeSingle(),
  ]);

  const adminDisplayName =
    (adminProfile.data?.display_name as string | null) ??
    (adminProfile.data?.profile_slug as string | null);
  const adminAvatarSlug = adminProfile.data?.profile_slug as string | null;
  const todayLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const stats: readonly StatCard[] = [
    {
      label: "Usuários",
      value: users.count ?? 0,
      icon: "👤",
      tone: "accent",
      href: "/admin/users",
    },
    {
      label: "Licenças ativas",
      value: licenses.count ?? 0,
      icon: "🔑",
      tone: "premium",
      href: "/admin/users",
    },
    {
      label: "Códigos disponíveis",
      value: codesAvailable.count ?? 0,
      icon: "🎫",
      tone: "info",
      href: "/admin/codes",
    },
    {
      label: "Códigos ativados",
      value: codesActivated.count ?? 0,
      icon: "✅",
      tone: "success",
      href: "/admin/codes",
    },
    {
      label: "Tags NFC criadas",
      value: nfcTags.count ?? 0,
      icon: "📡",
      tone: "gold",
    },
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
      <div className={styles.greetingHeader}>
        <div>
          <h1 className={styles.greetingTitle}>
            Olá, {firstName(adminDisplayName, admin.user.email)} 👋
          </h1>
          <p className={styles.subtitle}>Aqui está um resumo do seu sistema.</p>
        </div>
        <div className={styles.greetingRight}>
          <p className={styles.greetingDate}>{todayLabel}</p>
          <div className={styles.greetingWho}>
            {adminAvatarSlug ? (
              // eslint-disable-next-line @next/next/no-img-element -- served from our own API route
              <img
                alt=""
                className={styles.greetingAvatar}
                src={`/api/profile/${adminAvatarSlug}/avatar`}
              />
            ) : (
              <span className={styles.greetingAvatarFallback}>
                {firstName(adminDisplayName, admin.user.email).charAt(0).toUpperCase()}
              </span>
            )}
            <span>
              <strong>{adminDisplayName || admin.user.email}</strong>
              <span className={styles.greetingRole}>Administrador</span>
            </span>
          </div>
        </div>
      </div>

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
        {stats.map((stat) => {
          const inner = (
            <>
              <span className={styles.statIcon} data-tone={stat.tone}>
                {stat.icon}
              </span>
              <p className={styles.statValue}>{stat.value}</p>
              <p className={styles.statLabel}>{stat.label}</p>
            </>
          );
          return stat.href ? (
            <Link className={styles.statCardLink} href={stat.href} key={stat.label}>
              {inner}
            </Link>
          ) : (
            <div className={styles.statCard} key={stat.label}>
              {inner}
            </div>
          );
        })}
      </div>

      <div className={styles.dashboardColumns}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Usuários recentes</h2>
              <p className={styles.panelSubtitle}>
                Últimos usuários que se cadastraram no sistema.
              </p>
            </div>
            <Link className={styles.panelLink} href="/admin/users">
              Ver todos →
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
            <div>
              <h2 className={styles.sectionTitle}>🔑 Códigos recentes</h2>
              <p className={styles.panelSubtitle}>
                Códigos gerados recentemente no servidor.
              </p>
            </div>
            <Link className={styles.panelLink} href="/admin/codes">
              Ver todos →
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

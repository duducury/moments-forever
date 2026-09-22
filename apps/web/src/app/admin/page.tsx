import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

import { AdminNav } from "./admin-nav";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect(profilePath());
  const { supabase } = admin;

  const [users, licenses, codesAvailable, codesActivated, nfcTags] =
    await Promise.all([
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
    ]);

  const stats = [
    { label: "Usuários", value: users.count ?? 0 },
    { label: "Licenças ativas", value: licenses.count ?? 0 },
    { label: "Códigos disponíveis", value: codesAvailable.count ?? 0 },
    { label: "Códigos ativados", value: codesActivated.count ?? 0 },
    { label: "Tags NFC criadas", value: nfcTags.count ?? 0 },
  ];

  return (
    <main className={`page-shell ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin</h1>
          <p className={styles.subtitle}>Moments Forever</p>
        </div>
      </div>
      <AdminNav active="dashboard" />
      <div className={styles.statsGrid}>
        {stats.map((stat) => (
          <div className={styles.statCard} key={stat.label}>
            <p className={styles.statValue}>{stat.value}</p>
            <p className={styles.statLabel}>{stat.label}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

import styles from "../admin.module.css";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect(profilePath());

  return (
    <main className={`page-shell ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Denúncias</h1>
          <p className={styles.subtitle}>
            Conteúdo e usuários denunciados pela comunidade.
          </p>
        </div>
      </div>
      <ReportsClient />
    </main>
  );
}

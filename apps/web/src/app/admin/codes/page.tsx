import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

import styles from "../admin.module.css";
import { CodesClient } from "./codes-client";

export const dynamic = "force-dynamic";

export default async function AdminCodesPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect(profilePath());

  const plans = await admin.supabase
    .from("plans")
    .select("id, name")
    .neq("name", "LEGACY")
    .order("max_nfc_tags", { ascending: true });

  return (
    <main className={`page-shell ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Códigos</h1>
          <p className={styles.subtitle}>
            Códigos aleatórios gerados no servidor — nunca sequenciais.
          </p>
        </div>
      </div>
      <CodesClient
        plans={(plans.data ?? []).map((plan) => ({
          id: plan.id as string,
          name: plan.name as string,
        }))}
      />
    </main>
  );
}

import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

import { AdminNav } from "../admin-nav";
import styles from "../admin.module.css";
import { PlanEditForm } from "./plan-edit-form";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect(profilePath());

  const plans = await admin.supabase
    .from("plans")
    .select("id, name, max_nfc_tags, max_photos_per_trip, active")
    .order("max_nfc_tags", { ascending: true });

  return (
    <main className={`page-shell ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Planos</h1>
          <p className={styles.subtitle}>
            Limites usados por toda ativação/checagem — nada fica fixo no
            código.
          </p>
        </div>
      </div>
      <AdminNav active="plans" />
      <div className={styles.list}>
        {(plans.data ?? []).map((plan) => (
          <PlanEditForm
            key={plan.id as string}
            plan={{
              id: plan.id as string,
              name: plan.name as string,
              maxNfcTags: plan.max_nfc_tags as number,
              maxPhotosPerTrip: plan.max_photos_per_trip as number,
              active: plan.active as boolean,
            }}
          />
        ))}
      </div>
    </main>
  );
}

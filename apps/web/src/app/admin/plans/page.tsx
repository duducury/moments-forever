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

  const rows = (plans.data ?? []).map((plan) => ({
    id: plan.id as string,
    name: plan.name as string,
    maxNfcTags: plan.max_nfc_tags as number,
    maxPhotosPerTrip: plan.max_photos_per_trip as number,
    active: plan.active as boolean,
  }));
  const sellablePlans = rows.filter((plan) => plan.name !== "LEGACY");
  const legacyPlans = rows.filter((plan) => plan.name === "LEGACY");

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
      <h2 className={styles.sectionTitle}>Planos à venda</h2>
      <div className={styles.list}>
        {sellablePlans.map((plan) => (
          <PlanEditForm key={plan.id} plan={plan} />
        ))}
      </div>
      {legacyPlans.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>Interno / legado</h2>
          <p className={styles.subtitle}>
            Nunca vendido — usado só para migrar contas que já existiam
            antes do sistema de ativação.
          </p>
          <div className={styles.list}>
            {legacyPlans.map((plan) => (
              <PlanEditForm key={plan.id} plan={plan} />
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

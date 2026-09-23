import Link from "next/link";
import { redirect } from "next/navigation";

import { publicProfilePath } from "@/lib/profile/profile-slug";
import { profilePath } from "@/lib/routes/app-routes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

import { AdminNav } from "../admin-nav";
import styles from "../admin.module.css";
import { UserPlanSelect } from "./user-plan-select";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

export default async function AdminUsersPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect(profilePath());
  const { supabase } = admin;

  const users = await supabase
    .from("users")
    .select("id, display_name, profile_slug, is_admin, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const userIds = (users.data ?? []).map((row) => row.id as string);
  const safeIds =
    userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"];

  const [licenses, experiences, nfcTags, allPlans] = await Promise.all([
    supabase
      .from("licenses")
      .select("user_id, plan_id")
      .eq("status", "active")
      .in("user_id", safeIds),
    supabase.from("experiences").select("id, owner_id").in("owner_id", safeIds),
    supabase.from("nfc_tags").select("user_id").in("user_id", safeIds),
    supabase
      .from("plans")
      .select("id, name, max_nfc_tags")
      .order("max_nfc_tags", { ascending: true }),
  ]);

  const planOptions = (allPlans.data ?? []).map((plan) => ({
    id: plan.id as string,
    name: plan.name as string,
  }));
  const planById = new Map(
    (allPlans.data ?? []).map((plan) => [
      plan.id as string,
      { name: plan.name as string, maxNfcTags: plan.max_nfc_tags as number },
    ]),
  );

  // A user can hold several active licenses at once (codes stack) — group
  // by user and summarize instead of assuming exactly one.
  const licensesByUser = new Map<string, string[]>();
  for (const row of licenses.data ?? []) {
    const userId = row.user_id as string;
    const list = licensesByUser.get(userId) ?? [];
    list.push(row.plan_id as string);
    licensesByUser.set(userId, list);
  }

  const experienceIdsByUser = new Map<string, string[]>();
  for (const row of experiences.data ?? []) {
    const ownerId = row.owner_id as string;
    const list = experienceIdsByUser.get(ownerId) ?? [];
    list.push(row.id as string);
    experienceIdsByUser.set(ownerId, list);
  }
  const allExperienceIds = (experiences.data ?? []).map((row) => row.id as string);

  const photos =
    allExperienceIds.length > 0
      ? await supabase.from("photos").select("experience_id").in("experience_id", allExperienceIds)
      : { data: [] as { experience_id: string }[] };
  const photoCountByExperience = new Map<string, number>();
  for (const row of photos.data ?? []) {
    const experienceId = row.experience_id as string;
    photoCountByExperience.set(
      experienceId,
      (photoCountByExperience.get(experienceId) ?? 0) + 1,
    );
  }

  const nfcCountByUser = new Map<string, number>();
  for (const row of nfcTags.data ?? []) {
    const userId = row.user_id as string;
    nfcCountByUser.set(userId, (nfcCountByUser.get(userId) ?? 0) + 1);
  }

  return (
    <main className={`page-shell ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Usuários</h1>
          <p className={styles.subtitle}>
            {users.data?.length ?? 0} conta{(users.data?.length ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <AdminNav active="users" />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Plano</th>
              <th>NFCs</th>
              <th>Viagens</th>
              <th>Fotos</th>
              <th>Criado em</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((user) => {
              const id = user.id as string;
              const slug = user.profile_slug as string | null;
              const experienceIds = experienceIdsByUser.get(id) ?? [];
              const photoCount = experienceIds.reduce(
                (sum, experienceId) =>
                  sum + (photoCountByExperience.get(experienceId) ?? 0),
                0,
              );
              const planIds = licensesByUser.get(id) ?? [];
              const totalNfc = planIds.reduce(
                (sum, planId) => sum + (planById.get(planId)?.maxNfcTags ?? 0),
                0,
              );
              const planNames = planIds
                .map((planId) => planById.get(planId)?.name)
                .filter((name): name is string => Boolean(name));
              return (
                <tr key={id}>
                  <td>
                    {(user.display_name as string | null) ||
                      slug ||
                      id.slice(0, 8)}
                  </td>
                  <td>
                    <p className={styles.statLabel}>
                      {planNames.length > 0
                        ? `${planNames.join(" + ")} (${totalNfc} NFC)`
                        : "Sem licença ativa"}
                    </p>
                    <UserPlanSelect plans={planOptions} userId={id} />
                  </td>
                  <td>{nfcCountByUser.get(id) ?? 0}</td>
                  <td>{experienceIds.length}</td>
                  <td>{photoCount}</td>
                  <td>
                    {new Date(user.created_at as string).toLocaleDateString(
                      "pt-BR",
                    )}
                  </td>
                  <td>
                    <span
                      className={styles.badge}
                      data-tone={user.is_admin ? "accent" : "neutral"}
                    >
                      {user.is_admin ? "Admin" : "Ativo"}
                    </span>
                  </td>
                  <td>
                    {slug ? (
                      <Link
                        className="text-link"
                        href={publicProfilePath(slug)}
                        target="_blank"
                      >
                        Ver perfil
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

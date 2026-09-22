import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

import { AdminNav } from "../admin-nav";
import styles from "../admin.module.css";

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

  const [licenses, experiences, nfcTags] = await Promise.all([
    supabase
      .from("licenses")
      .select("user_id, plan_id")
      .eq("status", "active")
      .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("experiences")
      .select("id, owner_id")
      .in("owner_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("nfc_tags")
      .select("user_id")
      .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const planIds = [
    ...new Set((licenses.data ?? []).map((row) => row.plan_id as string)),
  ];
  const plans =
    planIds.length > 0
      ? await supabase.from("plans").select("id, name").in("id", planIds)
      : { data: [] as { id: string; name: string }[] };
  const planNameById = new Map(
    (plans.data ?? []).map((row) => [row.id as string, row.name as string]),
  );
  const planByUser = new Map(
    (licenses.data ?? []).map((row) => [
      row.user_id as string,
      planNameById.get(row.plan_id as string) ?? "—",
    ]),
  );

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
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((user) => {
              const id = user.id as string;
              const experienceIds = experienceIdsByUser.get(id) ?? [];
              const photoCount = experienceIds.reduce(
                (sum, experienceId) =>
                  sum + (photoCountByExperience.get(experienceId) ?? 0),
                0,
              );
              return (
                <tr key={id}>
                  <td>
                    {(user.display_name as string | null) ||
                      (user.profile_slug as string | null) ||
                      id.slice(0, 8)}
                  </td>
                  <td>{planByUser.get(id) ?? "—"}</td>
                  <td>{nfcCountByUser.get(id) ?? 0}</td>
                  <td>{experienceIds.length}</td>
                  <td>{photoCount}</td>
                  <td>
                    {new Date(user.created_at as string).toLocaleDateString(
                      "pt-BR",
                    )}
                  </td>
                  <td>{user.is_admin ? "Admin" : "Ativo"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

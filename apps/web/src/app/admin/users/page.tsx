import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

import { AdminNav } from "../admin-nav";
import styles from "../admin.module.css";
import { UsersTable, type UserRow } from "./users-table";

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

  const [licenses, experiences, allPlans, emails] = await Promise.all([
    supabase
      .from("licenses")
      .select("user_id, plan_id")
      .eq("status", "active")
      .in("user_id", safeIds),
    supabase.from("experiences").select("id, owner_id").in("owner_id", safeIds),
    supabase
      .from("plans")
      .select("id, name, max_nfc_tags")
      .order("max_nfc_tags", { ascending: true }),
    supabase.rpc("admin_list_user_emails", { p_user_ids: userIds }),
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
  const emailById = new Map(
    ((emails.data as { id: string; email: string }[] | null) ?? []).map(
      (row) => [row.id, row.email],
    ),
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

  const rows: UserRow[] = (users.data ?? []).map((user) => {
    const id = user.id as string;
    const slug = user.profile_slug as string | null;
    const experienceIds = experienceIdsByUser.get(id) ?? [];
    const photoCount = experienceIds.reduce(
      (sum, experienceId) => sum + (photoCountByExperience.get(experienceId) ?? 0),
      0,
    );
    const planIds = licensesByUser.get(id) ?? [];
    const totalTrips = planIds.reduce(
      (sum, planId) => sum + (planById.get(planId)?.maxNfcTags ?? 0),
      0,
    );
    const planCounts = new Map<string, number>();
    for (const planId of planIds) {
      const name = planById.get(planId)?.name;
      if (!name) continue;
      planCounts.set(name, (planCounts.get(name) ?? 0) + 1);
    }
    return {
      id,
      displayName: (user.display_name as string | null) || null,
      email: emailById.get(id) ?? null,
      profileSlug: slug,
      isAdmin: Boolean(user.is_admin),
      createdAt: user.created_at as string,
      tripsUsed: experienceIds.length,
      tripsLimit: totalTrips,
      photoCount,
      plans: [...planCounts.entries()].map(([name, count]) => ({ name, count })),
    };
  });

  return (
    <main className={`page-shell ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Usuários</h1>
          <p className={styles.subtitle}>
            {rows.length} conta{rows.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <AdminNav active="users" />
      <UsersTable plans={planOptions} rows={rows} />
    </main>
  );
}

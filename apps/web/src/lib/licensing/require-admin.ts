import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

/**
 * Grants is_admin to the caller when their email is on the ADMIN_EMAILS
 * allowlist (comma-separated, server-only env var — never NEXT_PUBLIC).
 * This is how the first admin account gets bootstrapped without a manual
 * database edit or ever putting an email/id in the repo. It only ever
 * grants, never revokes — a misconfigured or emptied env var can't lock
 * out an existing admin.
 */
async function bootstrapAdminFromAllowlist(
  supabase: ServerSupabase,
  user: User,
): Promise<void> {
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const email = user.email?.trim().toLowerCase();
  if (!email || !allowlist.includes(email)) return;

  const current = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (current.data?.is_admin) return;

  await supabase.from("users").update({ is_admin: true }).eq("id", user.id);
}

/** Plain is_admin check — no bootstrap, safe to call from any page that already has a supabase client + user id. */
export async function isAdminUser(
  supabase: ServerSupabase,
  userId: string,
): Promise<boolean> {
  const profile = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(profile.data?.is_admin);
}

/**
 * Server-side admin gate. Returns the admin user, or null when the caller
 * is unauthenticated or not an admin — callers must redirect/404 on null
 * themselves rather than rendering anything from the response.
 */
export async function requireAdminUser(): Promise<{
  readonly supabase: ServerSupabase;
  readonly user: User;
} | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await bootstrapAdminFromAllowlist(supabase, user);

  if (!(await isAdminUser(supabase, user.id))) return null;

  return { supabase, user };
}

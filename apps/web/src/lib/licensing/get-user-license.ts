import type { SupabaseClient } from "@supabase/supabase-js";

import type { UserLicense } from "./types";

/**
 * The caller's active license + plan limits, or null when they have none
 * (free sign-up accounts, or any account created before this feature
 * shipped that the backfill migration didn't reach). Callers must treat
 * null as "no plan-based limits to show", not as an error.
 */
export async function getUserLicense(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserLicense | null> {
  const license = await supabase
    .from("licenses")
    .select("id, plan_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (license.error || !license.data) return null;

  const plan = await supabase
    .from("plans")
    .select("id, name, max_nfc_tags, max_photos_per_trip")
    .eq("id", license.data.plan_id as string)
    .maybeSingle();

  if (plan.error || !plan.data) return null;

  return {
    id: license.data.id as string,
    planId: plan.data.id as string,
    planName: plan.data.name as string,
    maxNfcTags: plan.data.max_nfc_tags as number,
    maxPhotosPerTrip: plan.data.max_photos_per_trip as number,
  };
}

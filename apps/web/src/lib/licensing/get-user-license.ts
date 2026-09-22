import type { SupabaseClient } from "@supabase/supabase-js";

import type { UserLicenseSummary } from "./types";

/**
 * Aggregate over every active license the user holds, or null when they
 * have none (free sign-up accounts, or any pre-existing account the
 * backfill migration didn't reach). Callers must treat null as "no
 * plan-based limits to show", not as an error.
 */
export async function getUserLicense(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserLicenseSummary | null> {
  const licenses = await supabase
    .from("licenses")
    .select("plan_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (licenses.error || !licenses.data || licenses.data.length === 0) {
    return null;
  }

  const planIds = [...new Set(licenses.data.map((row) => row.plan_id as string))];
  const plans = await supabase
    .from("plans")
    .select("id, name, max_nfc_tags, max_photos_per_trip")
    .in("id", planIds);

  if (plans.error || !plans.data) return null;

  const planById = new Map(plans.data.map((row) => [row.id as string, row]));

  let maxNfcTags = 0;
  let maxPhotosPerTrip = 0;
  const planNames: string[] = [];
  for (const license of licenses.data) {
    const plan = planById.get(license.plan_id as string);
    if (!plan) continue;
    maxNfcTags += plan.max_nfc_tags as number;
    maxPhotosPerTrip = Math.max(maxPhotosPerTrip, plan.max_photos_per_trip as number);
    planNames.push(plan.name as string);
  }

  return { maxNfcTags, maxPhotosPerTrip, planNames };
}

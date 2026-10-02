import type { PricingPlanRow } from "@/app/pricing-section";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

/**
 * Public plans shown with their price and the WhatsApp contact button — on the
 * landing page and for a signed-in account that has no active license yet.
 * Uses the cookie-less anon client: plans are public data.
 */
export async function loadPricingPlans(): Promise<readonly PricingPlanRow[]> {
  const supabase = createSupabaseAnonClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("plans")
    .select(
      "name, max_nfc_tags, max_photos_per_trip, price_label, price_note, highlight",
    )
    .neq("name", "LEGACY")
    .not("price_label", "is", null)
    .order("max_nfc_tags", { ascending: true });

  return (data ?? []).map((plan) => ({
    name: plan.name as string,
    priceLabel: plan.price_label as string,
    priceNote: plan.price_note as string,
    trips: plan.max_nfc_tags as number,
    photosPerTrip: plan.max_photos_per_trip as number,
    nfcTags: plan.max_nfc_tags as number,
    highlight: plan.highlight as boolean,
  }));
}

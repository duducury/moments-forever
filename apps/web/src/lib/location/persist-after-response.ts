import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { persistExperiencePlaceCountryCodes, persistOwnerPlaceCountryCodes } from "./place-country-code";

/**
 * Fills `places.country_code` for the owner AFTER the response was sent.
 *
 * It used to be awaited at the top of /passaporte and of the owner's profile, so every visit paid two sequential
 * Supabase queries (experiences, then places without a code) before any page data was requested and, when a place
 * stayed unresolved, up to three Nominatim lookups on top. The work is best-effort and idempotent, so running it
 * in `after()` costs the page nothing; places that were missing a code show it from the next visit on.
 * Outside a request scope `after()` is unavailable: the work then just runs unawaited (it never throws).
 */
export function persistOwnerPlaceCountryCodesAfterResponse(
  supabase: SupabaseClient,
  ownerId: string,
): void {
  const run = () => persistOwnerPlaceCountryCodes(supabase, ownerId).then(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Same, for the places of ONE experience that was just created. /api/experiences/from-import used to await it:
 * two Supabase queries and, for a place whose name does not give the country, up to three throttled Nominatim lookups
 * (≥1.1 s each) before "Criando álbum…" could finish. The album does not need the code to exist, so it now runs
 * after the response.
 */
export function persistExperiencePlaceCountryCodesAfterResponse(
  supabase: SupabaseClient,
  experienceId: string,
): void {
  const run = () => persistExperiencePlaceCountryCodes(supabase, experienceId).then(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

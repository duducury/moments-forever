export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly maxNfcTags: number;
  readonly maxPhotosPerTrip: number;
  readonly active: boolean;
}

/** Name shown wherever a user's plan is displayed, for an admin-assigned custom plan. */
export const CUSTOM_PLAN_LABEL = "Personalizado";

/**
 * A user can hold several active licenses at once (one per redeemed
 * activation code — codes stack). This is the aggregate view: NFC
 * allowance sums across all of them (a consumable pool), the photo-per-trip
 * ceiling takes the best/highest one (it caps a single trip, not a pool).
 */
export interface UserLicenseSummary {
  /** Trips allowed: each plan's own trip limit, or its NFC number when it has none (Basic/Plus/Premium). */
  readonly maxTrips: number;
  readonly maxNfcTags: number;
  readonly maxPhotosPerTrip: number;
  readonly planNames: readonly string[];
}

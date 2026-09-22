export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly maxNfcTags: number;
  readonly maxPhotosPerTrip: number;
  readonly active: boolean;
}

/**
 * A user can hold several active licenses at once (one per redeemed
 * activation code — codes stack). This is the aggregate view: NFC
 * allowance sums across all of them (a consumable pool), the photo-per-trip
 * ceiling takes the best/highest one (it caps a single trip, not a pool).
 */
export interface UserLicenseSummary {
  readonly maxNfcTags: number;
  readonly maxPhotosPerTrip: number;
  readonly planNames: readonly string[];
}

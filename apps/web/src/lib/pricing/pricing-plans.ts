/**
 * Marketing copy for the pricing table on the logged-out home page.
 * Edit this list to change what's shown — nothing here is read from the
 * database, so it's safe to tweak prices/limits without a migration.
 * Keep `trips`/`photosPerTrip`/`nfcTags` in sync with the real plan limits
 * configured in /admin/planos if those ever change.
 */
export interface PricingPlan {
  readonly name: string;
  readonly price: string;
  readonly priceNote: string;
  readonly trips: number;
  readonly photosPerTrip: number;
  readonly nfcTags: number;
  readonly highlight?: boolean;
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    name: "Basic",
    price: "US$ 8",
    priceNote: "pagamento único",
    trips: 5,
    photosPerTrip: 100,
    nfcTags: 5,
  },
  {
    name: "Plus",
    price: "US$ 15",
    priceNote: "pagamento único",
    trips: 10,
    photosPerTrip: 250,
    nfcTags: 10,
    highlight: true,
  },
  {
    name: "Premium",
    price: "US$ 30",
    priceNote: "pagamento único",
    trips: 25,
    photosPerTrip: 500,
    nfcTags: 25,
  },
];

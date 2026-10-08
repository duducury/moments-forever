/** Upper bound for any custom limit: a typo guard, not a product rule. */
export const CUSTOM_PLAN_MAX_VALUE = 100_000;

export interface CustomPlanInput {
  readonly maxTrips: number;
  readonly maxPhotosPerTrip: number;
  readonly maxNfcTags: number;
  readonly active: boolean;
}

export type CustomPlanParse =
  | { readonly ok: true; readonly value: CustomPlanInput }
  | { readonly ok: false; readonly error: string };

function limit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 0 && value <= CUSTOM_PLAN_MAX_VALUE ? value : null;
}

/** Validates an admin request body; every number must be a whole number in 0…100000. */
export function parseCustomPlanInput(body: unknown): CustomPlanParse {
  if (!body || typeof body !== "object") return { ok: false, error: "Dados inválidos." };
  const raw = body as Record<string, unknown>;
  const maxTrips = limit(raw.maxTrips);
  const maxPhotosPerTrip = limit(raw.maxPhotosPerTrip);
  const maxNfcTags = limit(raw.maxNfcTags);
  if (maxTrips === null) return { ok: false, error: "Viagens: informe um número inteiro válido." };
  if (maxPhotosPerTrip === null) return { ok: false, error: "Fotos por viagem: informe um número inteiro válido." };
  if (maxNfcTags === null) return { ok: false, error: "Tags NFC: informe um número inteiro válido." };
  if (typeof raw.active !== "boolean") return { ok: false, error: "Status inválido." };
  return { ok: true, value: { maxTrips, maxPhotosPerTrip, maxNfcTags, active: raw.active } };
}

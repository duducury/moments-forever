import { NextResponse } from "next/server";

import { getUserLicense } from "@/lib/licensing/get-user-license";
import { isRateLimited } from "@/lib/licensing/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface RedeemBody {
  readonly code?: string;
}

const CODE_FORMAT = /^MF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/;
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

/** Same message for "doesn't exist", "already used", "revoked" and "expired" — never help enumerate codes. */
const GENERIC_CODE_ERROR = "Código inválido ou já utilizado.";
const LOCKOUT_ERROR =
  "Muitas tentativas incorretas. Sua conta ficou temporariamente bloqueada para novas ativações — tente novamente mais tarde.";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase local não configurado." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Cheap pre-filter before ever touching the database. The real, durable
  // protection is the lockout tracked inside redeem_activation_code() —
  // this in-memory limiter just softens raw request volume.
  if (isRateLimited(`redeem:${user.id}`, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 },
    );
  }

  let body: RedeemBody;
  try {
    body = (await request.json()) as RedeemBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const code = body.code?.trim().toUpperCase() ?? "";
  if (!CODE_FORMAT.test(code)) {
    return NextResponse.json({ error: GENERIC_CODE_ERROR }, { status: 400 });
  }

  const redeemed = await supabase.rpc("redeem_activation_code", {
    p_code: code,
  });

  if (redeemed.error) {
    // Only not_authenticated still raises — a real auth/programming error,
    // never an expected "wrong code" outcome.
    return NextResponse.json(
      { error: "Não foi possível ativar sua conta agora. Tente novamente." },
      { status: 500 },
    );
  }

  const row = redeemed.data?.[0] as
    | {
        plan_id: string | null;
        plan_name: string | null;
        max_nfc_tags: number | null;
        max_photos_per_trip: number | null;
        error_code: string | null;
      }
    | undefined;

  if (row?.error_code === "too_many_attempts") {
    return NextResponse.json({ error: LOCKOUT_ERROR }, { status: 423 });
  }
  if (
    row?.error_code === "code_not_found" ||
    row?.error_code === "code_unavailable"
  ) {
    return NextResponse.json({ error: GENERIC_CODE_ERROR }, { status: 400 });
  }

  const plan = row?.plan_id
    ? {
        plan_id: row.plan_id,
        plan_name: row.plan_name as string,
        max_nfc_tags: row.max_nfc_tags as number,
        max_photos_per_trip: row.max_photos_per_trip as number,
      }
    : undefined;
  if (!plan) {
    return NextResponse.json(
      { error: "Não foi possível ativar sua conta agora. Tente novamente." },
      { status: 500 },
    );
  }

  // Codes stack — tell the client the account's new running total, not just
  // this one code's plan, since that's what actually changed for the user.
  const total = await getUserLicense(supabase, user.id);

  return NextResponse.json({
    plan: {
      id: plan.plan_id,
      name: plan.plan_name,
      maxNfcTags: plan.max_nfc_tags,
      maxPhotosPerTrip: plan.max_photos_per_trip,
    },
    total: total
      ? {
          maxNfcTags: total.maxNfcTags,
          maxPhotosPerTrip: total.maxPhotosPerTrip,
        }
      : null,
  });
}

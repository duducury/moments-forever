import { NextResponse } from "next/server";

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
    const message = redeemed.error.message;
    if (message.includes("already_licensed")) {
      return NextResponse.json(
        { error: "Sua conta já possui uma licença ativa." },
        { status: 409 },
      );
    }
    if (
      message.includes("code_not_found") ||
      message.includes("code_unavailable")
    ) {
      return NextResponse.json({ error: GENERIC_CODE_ERROR }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Não foi possível ativar sua conta agora. Tente novamente." },
      { status: 500 },
    );
  }

  const plan = redeemed.data?.[0] as
    | {
        plan_id: string;
        plan_name: string;
        max_nfc_tags: number;
        max_photos_per_trip: number;
      }
    | undefined;
  if (!plan) {
    return NextResponse.json(
      { error: "Não foi possível ativar sua conta agora. Tente novamente." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    plan: {
      id: plan.plan_id,
      name: plan.plan_name,
      maxNfcTags: plan.max_nfc_tags,
      maxPhotosPerTrip: plan.max_photos_per_trip,
    },
  });
}

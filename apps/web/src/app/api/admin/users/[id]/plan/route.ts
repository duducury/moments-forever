import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/licensing/require-admin";

interface PatchBody {
  readonly planId?: string;
}

/**
 * Admin override: reset a user's licenses to exactly this one plan, no
 * activation code needed. This replaces — it does not stack the way
 * redeeming an additional code does; that's the deliberate distinction
 * between an admin "set the plan" action and a customer "buy another pack".
 */
export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id: userId } = await context.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const planId = body.planId?.trim() ?? "";
  if (!planId) {
    return NextResponse.json({ error: "planId é obrigatório." }, { status: 400 });
  }

  const plan = await admin.supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .maybeSingle();
  if (plan.error || !plan.data) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  const revoked = await admin.supabase
    .from("licenses")
    .update({ status: "revoked" })
    .eq("user_id", userId)
    .eq("status", "active");
  if (revoked.error) {
    return NextResponse.json({ error: revoked.error.message }, { status: 400 });
  }

  const created = await admin.supabase
    .from("licenses")
    .insert({ user_id: userId, plan_id: planId, status: "active" })
    .select("id, plan_id")
    .single();
  if (created.error || !created.data) {
    return NextResponse.json(
      { error: created.error?.message ?? "Falha ao conceder plano." },
      { status: 400 },
    );
  }
  return NextResponse.json({ license: created.data }, { status: 201 });
}

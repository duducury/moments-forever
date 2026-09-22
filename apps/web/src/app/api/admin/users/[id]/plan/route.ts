import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/licensing/require-admin";

interface PatchBody {
  readonly planId?: string;
}

/** Admin override: grant or change a user's plan directly, no activation code. */
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

  const existing = await admin.supabase
    .from("licenses")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existing.data) {
    const updated = await admin.supabase
      .from("licenses")
      .update({ plan_id: planId })
      .eq("id", existing.data.id as string)
      .select("id, plan_id")
      .single();
    if (updated.error || !updated.data) {
      return NextResponse.json(
        { error: updated.error?.message ?? "Falha ao atualizar plano." },
        { status: 400 },
      );
    }
    return NextResponse.json({ license: updated.data });
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

import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/licensing/require-admin";
import { parseCustomPlanInput } from "@/lib/licensing/custom-plan";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin only: create / change / deactivate a user's custom plan. The limits are
 * validated here and again inside the admin_set_custom_plan() database
 * function, which also re-checks that the caller is an admin — nothing in the
 * request body can grant anyone limits on its own.
 */
export async function PUT(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id: userId } = await context.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }
  if (!UUID.test(userId)) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const input = parseCustomPlanInput(body);
  if (!input.ok) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  const result = await admin.supabase.rpc("admin_set_custom_plan", {
    p_user_id: userId,
    p_max_trips: input.value.maxTrips,
    p_max_photos_per_trip: input.value.maxPhotosPerTrip,
    p_max_nfc_tags: input.value.maxNfcTags,
    p_active: input.value.active,
  });
  if (result.error) {
    const message = result.error.message ?? "";
    if (message.includes("not_authorized")) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
    }
    if (message.includes("user_not_found")) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ error: "Falha ao salvar o plano personalizado." }, { status: 400 });
  }
  return NextResponse.json({ planId: result.data as string, active: input.value.active });
}

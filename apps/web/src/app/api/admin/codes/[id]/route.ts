import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/licensing/require-admin";

interface PatchBody {
  readonly action?: string;
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await context.params;
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

  if (body.action !== "revoke") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  // Only an unredeemed code can be revoked — revoking one already activated
  // wouldn't undo the license it already granted (that's the separate
  // "Definir plano" action on /admin/users).
  const updated = await admin.supabase
    .from("activation_codes")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "available")
    .select("id")
    .maybeSingle();

  if (updated.error) {
    return NextResponse.json(
      { error: updated.error.message },
      { status: 400 },
    );
  }
  if (!updated.data) {
    return NextResponse.json(
      { error: "Código não está mais disponível para revogar." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}

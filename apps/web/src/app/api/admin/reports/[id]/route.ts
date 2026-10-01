import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/licensing/require-admin";

const VALID_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;

interface PatchBody {
  readonly status?: string;
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

  if (
    !body.status ||
    !VALID_STATUSES.includes(body.status as (typeof VALID_STATUSES)[number])
  ) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  // RLS (content_reports_update_admin) is the real enforcement here — this
  // admin check is a friendlier first-pass guard against the wrong error UI.
  const updated = await admin.supabase
    .from("content_reports")
    .update({ status: body.status })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (updated.error) {
    return NextResponse.json({ error: updated.error.message }, { status: 400 });
  }
  if (!updated.data) {
    return NextResponse.json({ error: "Denúncia não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

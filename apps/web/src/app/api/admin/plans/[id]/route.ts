import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/licensing/require-admin";

interface PatchBody {
  readonly max_nfc_tags?: number;
  readonly max_photos_per_trip?: number;
  readonly active?: boolean;
  readonly price_label?: string | null;
  readonly price_note?: string;
  readonly highlight?: boolean;
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

  const patch: Record<string, number | boolean | string | null> = {};
  if (body.max_nfc_tags !== undefined) {
    if (!Number.isInteger(body.max_nfc_tags) || body.max_nfc_tags < 0) {
      return NextResponse.json(
        { error: "max_nfc_tags inválido." },
        { status: 400 },
      );
    }
    patch.max_nfc_tags = body.max_nfc_tags;
  }
  if (body.max_photos_per_trip !== undefined) {
    if (
      !Number.isInteger(body.max_photos_per_trip) ||
      body.max_photos_per_trip < 0
    ) {
      return NextResponse.json(
        { error: "max_photos_per_trip inválido." },
        { status: 400 },
      );
    }
    patch.max_photos_per_trip = body.max_photos_per_trip;
  }
  if (body.active !== undefined) {
    patch.active = body.active;
  }
  if (body.price_label !== undefined) {
    if (body.price_label !== null && typeof body.price_label !== "string") {
      return NextResponse.json(
        { error: "price_label inválido." },
        { status: 400 },
      );
    }
    patch.price_label = body.price_label;
  }
  if (body.price_note !== undefined) {
    if (typeof body.price_note !== "string" || body.price_note.trim() === "") {
      return NextResponse.json(
        { error: "price_note inválido." },
        { status: 400 },
      );
    }
    patch.price_note = body.price_note;
  }
  if (body.highlight !== undefined) {
    patch.highlight = body.highlight;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const updated = await admin.supabase
    .from("plans")
    .update(patch)
    .eq("id", id)
    .select(
      "id, name, max_nfc_tags, max_photos_per_trip, active, price_label, price_note, highlight",
    )
    .single();

  if (updated.error || !updated.data) {
    return NextResponse.json(
      { error: updated.error?.message ?? "Falha ao atualizar plano." },
      { status: 400 },
    );
  }

  return NextResponse.json({ plan: updated.data });
}

import { NextResponse } from "next/server";

import { validateBlockInput } from "@/lib/moderation/user-blocks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface BlockBody {
  readonly blockedId?: string;
}

/** Whether the caller has blocked ?userId=… — used to render the initial Bloquear/Desbloquear state on a profile. */
export async function GET(request: Request) {
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

  const targetId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!targetId) {
    return NextResponse.json(
      { error: "userId é obrigatório." },
      { status: 400 },
    );
  }

  const existing = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetId)
    .maybeSingle();

  return NextResponse.json({ blocked: Boolean(existing.data) });
}

/** Block another user. user_blocks_not_self (DB CHECK constraint) is the real guard against self-block — this is just a friendlier early error. */
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

  let body: BlockBody;
  try {
    body = (await request.json()) as BlockBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const validated = validateBlockInput(body.blockedId, user.id);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { blockedId } = validated;

  const created = await supabase
    .from("user_blocks")
    .upsert(
      { blocker_id: user.id, blocked_id: blockedId },
      { onConflict: "blocker_id,blocked_id" },
    )
    .select("blocked_id")
    .maybeSingle();

  if (created.error) {
    return NextResponse.json(
      { error: "Não foi possível bloquear este usuário." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, blocked: true });
}

/** Unblock ?userId=… */
export async function DELETE(request: Request) {
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

  const targetId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!targetId) {
    return NextResponse.json(
      { error: "userId é obrigatório." },
      { status: 400 },
    );
  }

  const removed = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetId);

  if (removed.error) {
    return NextResponse.json(
      { error: "Não foi possível desbloquear este usuário." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, blocked: false });
}

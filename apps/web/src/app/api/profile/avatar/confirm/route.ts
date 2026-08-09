import { NextResponse } from "next/server";

import {
  deleteR2Object,
  getR2Config,
  isAvatarObjectKeyForUser,
  r2ObjectExists,
} from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface Body {
  /** Set to null to clear the permanent avatar. */
  readonly storageKey?: string | null;
}

export async function POST(request: Request) {
  if (!getR2Config()) {
    return NextResponse.json(
      { error: "Armazenamento R2 não configurado." },
      { status: 503 },
    );
  }

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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const current = await supabase
    .from("users")
    .select("avatar_storage_key")
    .eq("id", user.id)
    .maybeSingle();
  if (current.error) {
    return NextResponse.json({ error: current.error.message }, { status: 500 });
  }

  const previousKey =
    (current.data?.avatar_storage_key as string | null)?.trim() || null;

  if (body.storageKey === null) {
    const updated = await supabase
      .from("users")
      .update({ avatar_storage_key: null, avatar_photo_id: null })
      .eq("id", user.id);
    if (updated.error) {
      return NextResponse.json(
        { error: updated.error.message },
        { status: 500 },
      );
    }
    if (previousKey) {
      try {
        await deleteR2Object(previousKey);
      } catch {
        // Row already cleared; orphan cleanup is best-effort.
      }
    }
    return NextResponse.json({ ok: true, storageKey: null });
  }

  const storageKey = body.storageKey?.trim() ?? "";
  if (!storageKey || !isAvatarObjectKeyForUser(storageKey, user.id)) {
    return NextResponse.json(
      { error: "storageKey de avatar inválido." },
      { status: 400 },
    );
  }

  const exists = await r2ObjectExists(storageKey);
  if (!exists) {
    return NextResponse.json(
      { error: "Arquivo de avatar não encontrado no armazenamento." },
      { status: 400 },
    );
  }

  const updated = await supabase
    .from("users")
    .update({
      avatar_storage_key: storageKey,
      avatar_photo_id: null,
    })
    .eq("id", user.id);
  if (updated.error) {
    return NextResponse.json({ error: updated.error.message }, { status: 500 });
  }

  if (previousKey && previousKey !== storageKey) {
    try {
      await deleteR2Object(previousKey);
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ ok: true, storageKey });
}

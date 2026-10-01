import { NextResponse } from "next/server";

import { deleteR2Objects, getR2Config } from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ERROR_MESSAGES: Record<string, { message: string; status: number }> = {
  not_authorized: { message: "Não autorizado.", status: 401 },
  user_not_found: { message: "Usuário não encontrado.", status: 404 },
};

/**
 * Self-service account deletion. Mirrors DELETE /api/admin/users/[id]
 * exactly (same RPC shape, same R2-cleanup-after pattern) but calls
 * delete_own_account() instead of admin_delete_user() — that RPC uses
 * auth.uid() directly and has no target-user parameter, so this route can
 * only ever delete the caller's own account.
 */
export async function DELETE() {
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
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const deleted = await supabase.rpc("delete_own_account");

  if (deleted.error) {
    const known = ERROR_MESSAGES[deleted.error.message];
    if (known) {
      return NextResponse.json({ error: known.message }, { status: known.status });
    }
    return NextResponse.json(
      { error: deleted.error.message ?? "Falha ao excluir a conta." },
      { status: 400 },
    );
  }

  const storageKeys = ((deleted.data as { storage_key: string }[] | null) ?? [])
    .map((row) => row.storage_key)
    .filter((key): key is string => typeof key === "string" && key.length > 0);

  if (storageKeys.length > 0 && getR2Config()) {
    try {
      await deleteR2Objects(storageKeys);
    } catch {
      // Orphan objects can be cleaned later; the account is already gone.
    }
  }

  try {
    // Best-effort: the account (and its auth.users row) is already gone by
    // this point, so this just clears the session cookie on this response.
    // The client also calls signOut() itself after a successful DELETE, to
    // reliably clear its own local/session storage too.
    await supabase.auth.signOut();
  } catch {
    // Already-deleted user may make this reject; the account is gone either way.
  }

  return NextResponse.json({ ok: true });
}

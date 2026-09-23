import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/licensing/require-admin";
import { deleteR2Objects, getR2Config } from "@/lib/storage/r2";

const ERROR_MESSAGES: Record<string, { message: string; status: number }> = {
  cannot_delete_self: {
    message: "Você não pode excluir sua própria conta por aqui.",
    status: 400,
  },
  cannot_delete_admin: {
    message: "Não é possível excluir outra conta de administrador.",
    status: 403,
  },
  user_not_found: { message: "Usuário não encontrado.", status: 404 },
  not_authorized: { message: "Não autorizado.", status: 403 },
};

export async function DELETE(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await context.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const deleted = await admin.supabase.rpc("admin_delete_user", {
    p_user_id: id,
  });

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

  return NextResponse.json({ ok: true });
}

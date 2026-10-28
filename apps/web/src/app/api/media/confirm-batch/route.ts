import { NextResponse } from "next/server";

import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { parseConfirmItems, planConfirm } from "@/lib/storage/media-batch";
import { r2ObjectExists } from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** R2 existence checks in flight at once for one batch. */
const HEAD_CONCURRENCY = 8;

/**
 * Confirms several uploaded photos of ONE experience in a single request: one sign-in check, one ownership check
 * and one photos query for the batch, then the R2 existence checks and the row updates in parallel. Each photo is
 * answered on its own (`ok` / `error`), so one bad photo never hides the others. Same rules as `/api/media/confirm`.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase local não configurado." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: { readonly experienceId?: string; readonly items?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const experienceId = body.experienceId?.trim() ?? "";
  const items = parseConfirmItems(body.items);
  if (!experienceId || !items) {
    return NextResponse.json(
      { error: "experienceId e uma lista válida de fotos são obrigatórios." },
      { status: 400 },
    );
  }

  const owned = await supabase
    .from("experiences")
    .select("id")
    .eq("id", experienceId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (owned.error || !owned.data) {
    return NextResponse.json({ error: "Experiência não encontrada." }, { status: 404 });
  }

  const found = await supabase
    .from("photos")
    .select("id")
    .in("id", items.map((item) => item.photoId))
    .eq("experience_id", experienceId);
  if (found.error) {
    return NextResponse.json({ error: "Falha ao confirmar armazenamento." }, { status: 500 });
  }
  const existing = new Set((found.data ?? []).map((row) => row.id as string));

  const results = await mapWithConcurrency(items, HEAD_CONCURRENCY, async (item) => {
    if (!existing.has(item.photoId)) {
      return { photoId: item.photoId, ok: false as const, error: "Foto não encontrada." };
    }
    const plan = planConfirm({ userId: user.id, experienceId, item });
    if (!plan.ok) return { photoId: item.photoId, ok: false as const, error: plan.error };

    const present = await Promise.all(plan.headKeys.map((key) => r2ObjectExists(key)));
    if (present.some((exists) => !exists)) {
      return {
        photoId: item.photoId,
        ok: false as const,
        error: "Objeto não encontrado no armazenamento.",
      };
    }

    const updated = await supabase
      .from("photos")
      .update(plan.patch)
      .eq("id", item.photoId)
      .eq("experience_id", experienceId)
      .select("id")
      .single();
    if (updated.error || !updated.data) {
      return {
        photoId: item.photoId,
        ok: false as const,
        error: updated.error?.message ?? "Falha ao confirmar armazenamento.",
      };
    }
    return { photoId: item.photoId, ok: true as const };
  });

  return NextResponse.json({ results });
}

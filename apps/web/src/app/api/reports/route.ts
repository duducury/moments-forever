import { NextResponse } from "next/server";

import {
  type ContentReportInput,
  validateContentReportInput,
} from "@/lib/moderation/content-reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Lets any authenticated visitor report a user/experience/album/photo.
 * Content is written exactly as the caller claims (reporter_id is forced to
 * the caller's own id below) — content_reports' own RLS
 * (content_reports_insert_own, 20261001101000_content_reports.sql) is the
 * real enforcement: it rejects any insert where reporter_id isn't
 * auth.uid(), so this check here is just an early, friendlier error.
 */
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

  let body: ContentReportInput;
  try {
    body = (await request.json()) as ContentReportInput;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const validated = validateContentReportInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { targetType, targetId, reason, details } = validated.value;

  const created = await supabase
    .from("content_reports")
    .insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details,
    })
    .select("id")
    .single();

  if (created.error || !created.data) {
    return NextResponse.json(
      { error: "Não foi possível enviar a denúncia." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, id: created.data.id as string }, {
    status: 201,
  });
}

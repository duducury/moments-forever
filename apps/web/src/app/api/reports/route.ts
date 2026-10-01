import { NextResponse } from "next/server";

import {
  type ContentReportInput,
  insertContentReport,
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
 *
 * The actual write goes through insertContentReport() (src/lib/moderation/
 * content-reports.ts), which never reports success unless Supabase actually
 * returned a persisted row's id — on any failure (RLS rejection, missing
 * grant, schema-cache miss, whatever) the real Postgres/PostgREST error is
 * logged here server-side and a non-2xx response goes back, so the client
 * never shows "denúncia enviada" for a write that didn't happen.
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
  const created = await insertContentReport(supabase, user.id, validated.value);

  if (!created.ok) {
    console.error("[/api/reports] insert failed:", created.error);
    return NextResponse.json(
      { error: "Não foi possível enviar a denúncia." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}

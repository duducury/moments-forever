export const CONTENT_REPORT_TARGET_TYPES = [
  "user",
  "experience",
  "album",
  "photo",
] as const;
export type ContentReportTargetType =
  (typeof CONTENT_REPORT_TARGET_TYPES)[number];

export const CONTENT_REPORT_REASONS = [
  "offensive",
  "illegal",
  "spam",
  "inappropriate",
  "other",
] as const;
export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number];

export function isContentReportTargetType(
  value: string,
): value is ContentReportTargetType {
  return (CONTENT_REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

export function isContentReportReason(
  value: string,
): value is ContentReportReason {
  return (CONTENT_REPORT_REASONS as readonly string[]).includes(value);
}

export interface ContentReportInput {
  readonly targetType?: string;
  readonly targetId?: string;
  readonly reason?: string;
  readonly details?: string;
}

/**
 * Narrow shape of the Supabase query builder insertContentReport() actually
 * calls — not the full client type, so a test can pass a lightweight fake
 * instead of a real Supabase client. The real server client satisfies this
 * structurally.
 */
export interface ContentReportsTable {
  from(
    table: "content_reports",
  ): {
    insert(row: {
      readonly reporter_id: string;
      readonly target_type: string;
      readonly target_id: string;
      readonly reason: string;
      readonly details: string | null;
    }): {
      select(columns: "id"): {
        single(): PromiseLike<{
          readonly data: { readonly id: string } | null;
          readonly error: { readonly message: string } | null;
        }>;
      };
    };
  };
}

export type ContentReportValidation =
  | {
      readonly ok: true;
      readonly value: {
        readonly targetType: ContentReportTargetType;
        readonly targetId: string;
        readonly reason: ContentReportReason;
        readonly details: string | null;
      };
    }
  | { readonly ok: false; readonly error: string };

/**
 * Pure validation shared by the /api/reports handler — kept separate so it
 * can be unit tested without a request/DB round trip. RLS
 * (content_reports_insert_own) is still the real security boundary; this
 * only rejects obviously-bad input early.
 */
export function validateContentReportInput(
  body: ContentReportInput,
): ContentReportValidation {
  const targetType = body.targetType?.trim() ?? "";
  const targetId = body.targetId?.trim() ?? "";
  const reason = body.reason?.trim() ?? "";
  const details = body.details?.trim() || null;

  if (!isContentReportTargetType(targetType)) {
    return { ok: false, error: "Tipo de conteúdo inválido." };
  }
  if (!targetId) {
    return { ok: false, error: "Conteúdo denunciado não informado." };
  }
  if (!isContentReportReason(reason)) {
    return { ok: false, error: "Motivo inválido." };
  }

  return { ok: true, value: { targetType, targetId, reason, details } };
}

export type InsertContentReportResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: string };

/**
 * The actual write, extracted out of the route handler so the "never claim
 * success unless a row was really returned" contract is unit-testable
 * without a live DB (see content-reports.test.ts) — a fake that returns an
 * error, or one that returns no usable id, must always come back as `ok:
 * false` here, never `ok: true`. RLS (content_reports_insert_own) is still
 * the real security boundary that decides whether the insert is allowed at
 * all; this only decides how its outcome gets reported to the caller.
 */
export async function insertContentReport(
  supabase: ContentReportsTable,
  reporterId: string,
  input: {
    readonly targetType: ContentReportTargetType;
    readonly targetId: string;
    readonly reason: ContentReportReason;
    readonly details: string | null;
  },
): Promise<InsertContentReportResult> {
  const result = await supabase
    .from("content_reports")
    .insert({
      reporter_id: reporterId,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      details: input.details,
    })
    .select("id")
    .single();

  const id = result.data?.id;
  if (result.error || typeof id !== "string" || id.length === 0) {
    return {
      ok: false,
      error: result.error?.message ?? "insert_returned_no_row",
    };
  }
  return { ok: true, id };
}

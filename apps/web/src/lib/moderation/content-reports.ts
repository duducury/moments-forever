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

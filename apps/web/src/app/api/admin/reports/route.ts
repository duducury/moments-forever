import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/licensing/require-admin";

const LIST_LIMIT = 200;

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const reports = await admin.supabase
    .from("content_reports")
    .select(
      "id, reporter_id, target_type, target_id, reason, details, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (reports.error) {
    return NextResponse.json({ error: reports.error.message }, { status: 500 });
  }

  const reporterIds = [
    ...new Set((reports.data ?? []).map((row) => row.reporter_id as string)),
  ];
  const reporters =
    reporterIds.length > 0
      ? await admin.supabase
          .from("users")
          .select("id, display_name, profile_slug")
          .in("id", reporterIds)
      : { data: [] as { id: string; display_name: string | null; profile_slug: string | null }[] };
  const reporterById = new Map(
    (reporters.data ?? []).map((row) => [
      row.id as string,
      {
        label:
          (row.display_name as string | null) ||
          (row.profile_slug as string | null) ||
          (row.id as string).slice(0, 8),
        profileSlug: (row.profile_slug as string | null) ?? null,
      },
    ]),
  );

  return NextResponse.json({
    reports: (reports.data ?? []).map((row) => {
      const reporter = reporterById.get(row.reporter_id as string) ?? null;
      return {
        id: row.id as string,
        reporterLabel: reporter?.label ?? (row.reporter_id as string).slice(0, 8),
        reporterProfileSlug: reporter?.profileSlug ?? null,
        targetType: row.target_type as string,
        targetId: row.target_id as string,
        reason: row.reason as string,
        details: (row.details as string | null) ?? null,
        status: row.status as string,
        createdAt: row.created_at as string,
      };
    }),
  });
}

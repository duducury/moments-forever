import { NextResponse } from "next/server";

import { generateActivationCode } from "@/lib/licensing/codes";
import { requireAdminUser } from "@/lib/licensing/require-admin";

const MAX_QUANTITY = 1000;
const LIST_LIMIT = 200;

interface GenerateBody {
  readonly quantity?: number;
  readonly planId?: string;
}

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const codes = await admin.supabase
    .from("activation_codes")
    .select("id, code, plan_id, status, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (codes.error) {
    return NextResponse.json({ error: codes.error.message }, { status: 500 });
  }

  const planIds = [
    ...new Set((codes.data ?? []).map((row) => row.plan_id as string)),
  ];
  const plans =
    planIds.length > 0
      ? await admin.supabase.from("plans").select("id, name").in("id", planIds)
      : { data: [] as { id: string; name: string }[] };
  const planNameById = new Map(
    (plans.data ?? []).map((row) => [row.id as string, row.name as string]),
  );

  const userIds = [
    ...new Set(
      (codes.data ?? [])
        .map((row) => row.user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const users =
    userIds.length > 0
      ? await admin.supabase
          .from("users")
          .select("id, display_name, profile_slug")
          .in("id", userIds)
      : { data: [] as { id: string; display_name: string | null; profile_slug: string | null }[] };
  const userById = new Map(
    (users.data ?? []).map((row) => [
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

  const counts = { available: 0, activated: 0, revoked: 0 };
  for (const row of codes.data ?? []) {
    const status = row.status as keyof typeof counts;
    if (status in counts) counts[status] += 1;
  }

  return NextResponse.json({
    counts,
    codes: (codes.data ?? []).map((row) => {
      const user = row.user_id
        ? (userById.get(row.user_id as string) ?? null)
        : null;
      return {
        id: row.id as string,
        code: row.code as string,
        status: row.status as string,
        planName: planNameById.get(row.plan_id as string) ?? "—",
        userLabel: user?.label ?? null,
        userProfileSlug: user?.profileSlug ?? null,
        createdAt: row.created_at as string,
      };
    }),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const quantity = body.quantity ?? 0;
  const planId = body.planId?.trim() ?? "";
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return NextResponse.json(
      { error: `Quantidade deve ser entre 1 e ${MAX_QUANTITY}.` },
      { status: 400 },
    );
  }
  if (!planId) {
    return NextResponse.json({ error: "Plano é obrigatório." }, { status: 400 });
  }

  const plan = await admin.supabase
    .from("plans")
    .select("id, name")
    .eq("id", planId)
    .maybeSingle();
  if (plan.error || !plan.data) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  const rows = Array.from({ length: quantity }, () => ({
    code: generateActivationCode(),
    plan_id: planId,
    created_by: admin.user.id,
  }));

  const created = await admin.supabase
    .from("activation_codes")
    .insert(rows)
    .select("code");
  if (created.error || !created.data) {
    return NextResponse.json(
      { error: created.error?.message ?? "Falha ao gerar códigos." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      codes: created.data.map((row) => row.code as string),
      planName: plan.data.name as string,
    },
    { status: 201 },
  );
}

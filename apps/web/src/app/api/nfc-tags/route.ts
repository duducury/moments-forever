import { NextResponse } from "next/server";

import { generateNfcToken } from "@/lib/licensing/codes";
import { getUserLicense } from "@/lib/licensing/get-user-license";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface CreateTagBody {
  readonly experienceId?: string;
}

function nfcUrl(token: string): string {
  return `${getSiteUrl()}/n/${token}`;
}

/** Read-only lookup — never creates a tag, so opening the "Vincular NFC" tab has no side effect. */
export async function GET(request: Request) {
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

  const experienceId = new URL(request.url).searchParams.get("experienceId");
  if (!experienceId) {
    const license = await getUserLicense(supabase, user.id);
    const count = await supabase
      .from("nfc_tags")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    return NextResponse.json({
      tag: null,
      usedCount: count.count ?? 0,
      maxNfcTags: license?.maxNfcTags ?? null,
    });
  }

  const [tag, license, count] = await Promise.all([
    supabase
      .from("nfc_tags")
      .select("token")
      .eq("trip_id", experienceId)
      .eq("user_id", user.id)
      .maybeSingle(),
    getUserLicense(supabase, user.id),
    supabase
      .from("nfc_tags")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  return NextResponse.json({
    tag: tag.data?.token
      ? { token: tag.data.token as string, url: nfcUrl(tag.data.token as string) }
      : null,
    usedCount: count.count ?? 0,
    maxNfcTags: license?.maxNfcTags ?? null,
  });
}

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

  let body: CreateTagBody;
  try {
    body = (await request.json()) as CreateTagBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const experienceId = body.experienceId?.trim() ?? "";
  if (!experienceId) {
    return NextResponse.json(
      { error: "experienceId é obrigatório." },
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
    return NextResponse.json(
      { error: "Viagem não encontrada." },
      { status: 404 },
    );
  }

  const existing = await supabase
    .from("nfc_tags")
    .select("token")
    .eq("trip_id", experienceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing.data?.token) {
    return NextResponse.json({
      token: existing.data.token as string,
      url: nfcUrl(existing.data.token as string),
    });
  }

  const license = await getUserLicense(supabase, user.id);
  if (license) {
    const count = await supabase
      .from("nfc_tags")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count.count ?? 0) >= license.maxNfcTags) {
      return NextResponse.json(
        {
          error: `Você atingiu o limite de ${license.maxNfcTags} tags NFC do seu plano.`,
        },
        { status: 409 },
      );
    }
  }

  const token = generateNfcToken();
  const created = await supabase
    .from("nfc_tags")
    .insert({
      user_id: user.id,
      token,
      trip_id: experienceId,
      status: "linked",
    })
    .select("token")
    .single();

  if (created.error || !created.data) {
    const message = created.error?.message ?? "";
    if (message.includes("nfc_tag_limit_reached")) {
      return NextResponse.json(
        { error: "Você atingiu o limite de tags NFC do seu plano." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Não foi possível vincular a tag NFC." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      token: created.data.token as string,
      url: nfcUrl(created.data.token as string),
    },
    { status: 201 },
  );
}

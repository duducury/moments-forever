import { NextResponse } from "next/server";

import { generateNfcToken } from "@/lib/licensing/codes";
import { getUserLicense } from "@/lib/licensing/get-user-license";
import { pickPrimaryAlbumId } from "@/lib/nfc/pick-primary-album";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface CreateTagBody {
  readonly experienceId?: string;
  readonly albumId?: string;
}

function nfcUrl(token: string): string {
  return `${getSiteUrl()}/n/${token}`;
}

type Supabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

/**
 * Resolves which root album a request means. Callers that know exactly which
 * destination card they mean (the "Ativar NFC" screen) pass albumId
 * directly — it's validated to actually belong to experienceId. Callers that
 * only know the experience (the /perfil "Editar viagem" NFC tab has no album
 * picker) get the same "primary" album /n/[token] used to fall back to
 * before this file supported multiple destinations per trip, so that
 * existing call site keeps behaving exactly as it always did.
 */
async function resolveAlbumId(
  supabase: Supabase,
  experienceId: string,
  requestedAlbumId: string | null,
): Promise<{ readonly albumId: string } | { readonly error: string }> {
  if (requestedAlbumId) {
    const album = await supabase
      .from("albums")
      .select("id")
      .eq("id", requestedAlbumId)
      .eq("experience_id", experienceId)
      .is("parent_album_id", null)
      .maybeSingle();
    if (album.error || !album.data?.id) {
      return { error: "Álbum não encontrado." };
    }
    return { albumId: album.data.id as string };
  }

  const rootAlbums = await supabase
    .from("albums")
    .select("id, position")
    .eq("experience_id", experienceId)
    .is("parent_album_id", null);
  if (rootAlbums.error) {
    return { error: rootAlbums.error.message };
  }
  const albumId = pickPrimaryAlbumId(
    (rootAlbums.data ?? []).map((row) => ({
      id: row.id as string,
      position: row.position as number,
    })),
  );
  if (!albumId) {
    return { error: "Esta viagem ainda não tem nenhuma pasta." };
  }
  return { albumId };
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

  const searchParams = new URL(request.url).searchParams;
  const experienceId = searchParams.get("experienceId");
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

  const resolved = await resolveAlbumId(
    supabase,
    experienceId,
    searchParams.get("albumId"),
  );
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const [tag, license, count] = await Promise.all([
    supabase
      .from("nfc_tags")
      .select("token")
      .eq("album_id", resolved.albumId)
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

  const resolved = await resolveAlbumId(
    supabase,
    experienceId,
    body.albumId?.trim() || null,
  );
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const { albumId } = resolved;

  const existing = await supabase
    .from("nfc_tags")
    .select("token")
    .eq("album_id", albumId)
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
      album_id: albumId,
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

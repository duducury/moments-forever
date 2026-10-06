import { NextResponse } from "next/server";

import {
  isMissingSourceAssetColumn,
  normalizeSourceAssetId,
} from "@/lib/photo-library/source-asset-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_ITEMS = 2000;
const CHUNK = 25;

interface Body {
  readonly items?: readonly {
    readonly photo_id?: unknown;
    readonly source_asset_id?: unknown;
  }[];
}

/**
 * Records which library photo each just-created photo came from. Needed for
 * brand-new trips, which are created through the import RPC (that RPC does not
 * carry the field). Best effort by design: the photos already exist either way.
 */
export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id: experienceId } = await context.params;
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const items = (body.items ?? []).slice(0, MAX_ITEMS).flatMap((item) => {
    const sourceAssetId = normalizeSourceAssetId(item.source_asset_id);
    const photoId = typeof item.photo_id === "string" ? item.photo_id : "";
    return sourceAssetId && UUID.test(photoId)
      ? [{ photoId, sourceAssetId }]
      : [];
  });
  if (items.length === 0) {
    return NextResponse.json({ error: "Nada para registrar." }, { status: 400 });
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

  let updated = 0;
  for (let start = 0; start < items.length; start += CHUNK) {
    const results = await Promise.all(
      items.slice(start, start + CHUNK).map((item) =>
        supabase
          .from("photos")
          .update({ source_asset_id: item.sourceAssetId })
          .eq("id", item.photoId)
          .eq("experience_id", experienceId),
      ),
    );
    for (const result of results) {
      if (result.error) {
        if (isMissingSourceAssetColumn(result.error.message)) {
          // Migration not applied yet: nothing to record, nothing is broken.
          return NextResponse.json({ updated: 0, skipped: "column_missing" });
        }
        continue;
      }
      updated += 1;
    }
  }
  return NextResponse.json({ updated });
}

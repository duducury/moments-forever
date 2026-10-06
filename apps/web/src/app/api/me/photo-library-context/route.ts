import { NextResponse } from "next/server";

import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import {
  buildExistingTrips,
  buildKnownAssets,
  buildLegacyPhotos,
  type AlbumRow,
  type PhotoRow,
} from "@/lib/photo-library/existing-trips";
import { isMissingSourceAssetColumn } from "@/lib/photo-library/source-asset-id";
import type { PhotoLibraryContext } from "@/lib/photo-library/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_ROWS = 50_000;
const MAX_LEGACY_EXPERIENCES = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

async function loadAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    readonly data: T[] | null;
    readonly error: { readonly message: string } | null;
  }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const page = await fetchPage(from, from + PAGE - 1);
    if (page.error) return { rows, error: page.error.message };
    const data = page.data ?? [];
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return { rows, error: null };
}

async function loadPhotos(
  supabase: Client,
  experienceIds: readonly string[],
): Promise<PhotoRow[]> {
  const columns =
    "experience_id, album_id, captured_at, exact_latitude, exact_longitude, width, height";
  const withOrigin = await loadAll<PhotoRow>((from, to) =>
    supabase
      .from("photos")
      .select(`${columns}, source_asset_id`)
      .in("experience_id", experienceIds as string[])
      .order("id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{
      data: PhotoRow[] | null;
      error: { message: string } | null;
    }>,
  );
  if (!withOrigin.error) return withOrigin.rows;
  if (!isMissingSourceAssetColumn(withOrigin.error)) {
    throw new Error(withOrigin.error);
  }

  // Migration not applied yet: everything is "legacy" until it is.
  const without = await loadAll<Omit<PhotoRow, "source_asset_id">>((from, to) =>
    supabase
      .from("photos")
      .select(columns)
      .in("experience_id", experienceIds as string[])
      .order("id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{
      data: Omit<PhotoRow, "source_asset_id">[] | null;
      error: { message: string } | null;
    }>,
  );
  if (without.error) throw new Error(without.error);
  return without.rows.map((row) => ({ ...row, source_asset_id: null }));
}

/**
 * What Moments Forever already holds, to compare with the phone's library ON the
 * phone. Sends the user's own data only — nothing from the library comes here.
 * `?experienceIds=a,b` additionally returns the date+place of older photos
 * (from before source_asset_id) of those trips.
 */
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

  const legacyIds = new Set(
    (new URL(request.url).searchParams.get("experienceIds") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => UUID.test(value))
      .slice(0, MAX_LEGACY_EXPERIENCES),
  );

  try {
    const cards = await loadOwnerPlaceCards(supabase, user.id);
    if (cards.error !== null) {
      return NextResponse.json({ error: cards.error }, { status: 400 });
    }
    const experienceIds = [...new Set(cards.places.map((card) => card.experienceId))];
    if (experienceIds.length === 0) {
      const empty: PhotoLibraryContext = { trips: [], knownAssets: [], legacyPhotos: [] };
      return NextResponse.json(empty);
    }

    const albumsResult = await loadAll<AlbumRow>((from, to) =>
      supabase
        .from("albums")
        .select("id, experience_id, parent_album_id")
        .in("experience_id", experienceIds)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: AlbumRow[] | null;
        error: { message: string } | null;
      }>,
    );
    if (albumsResult.error) {
      return NextResponse.json({ error: albumsResult.error }, { status: 400 });
    }

    const photos = await loadPhotos(supabase, experienceIds);
    const body: PhotoLibraryContext = {
      trips: buildExistingTrips({
        cards: cards.places,
        albums: albumsResult.rows,
        photos,
      }),
      knownAssets: buildKnownAssets(photos, albumsResult.rows),
      legacyPhotos: legacyIds.size > 0 ? buildLegacyPhotos(photos, legacyIds) : [],
    };
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar suas viagens." },
      { status: 400 },
    );
  }
}

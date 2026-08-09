import { NextResponse } from "next/server";

import { assignPhotosToAlbumsInExperience } from "@/lib/location/assign-photos-to-places";
import { ensureAlbumMomentId } from "@/lib/location/ensure-album-moment";
import { identifyExperiencePlaces } from "@/lib/location/identify-experience-places";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface IncomingPhoto {
  readonly id: string;
  /** Required when placement is "album"; ignored (except as fallback) for "gps". */
  readonly album_id?: string | null;
  readonly captured_at?: string | null;
  readonly date_source?: string | null;
  readonly exact_latitude?: number | null;
  readonly exact_longitude?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly bytes?: number | null;
  readonly format?: string | null;
}

interface PostBody {
  readonly photos?: readonly IncomingPhoto[];
  /**
   * "album" — all photos go to album_id (legacy).
   * "gps" — match/create places inside this experience by GPS; never a new trip.
   */
  readonly placement?: "album" | "gps";
  readonly fallback_album_id?: string | null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(
  _request: Request,
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

  const owned = await supabase
    .from("experiences")
    .select("id")
    .eq("id", experienceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (owned.error || !owned.data) {
    return NextResponse.json(
      { error: "Experiência não encontrada." },
      { status: 404 },
    );
  }

  const photos = await supabase
    .from("photos")
    .select(
      "id, album_id, captured_at, position_in_album, position_in_moment",
    )
    .eq("experience_id", experienceId)
    .order("position_in_album", { ascending: true })
    .order("position_in_moment", { ascending: true });

  if (photos.error) {
    return NextResponse.json({ error: photos.error.message }, { status: 400 });
  }

  return NextResponse.json({
    photos: (photos.data ?? []).map((photo) => ({
      id: photo.id as string,
      album_id: (photo.album_id as string | null) ?? null,
      captured_at: (photo.captured_at as string | null) ?? null,
    })),
  });
}

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

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const photos = body.photos ?? [];
  if (photos.length === 0) {
    return NextResponse.json(
      { error: "Envie pelo menos uma foto." },
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
      { error: "Experiência não encontrada." },
      { status: 404 },
    );
  }

  const placement = body.placement === "gps" ? "gps" : "album";
  let albumByPhotoId = new Map<string, string>();

  if (placement === "gps") {
    const fallbackAlbumId =
      body.fallback_album_id?.trim() ||
      photos.find((photo) => photo.album_id)?.album_id ||
      "";
    if (!fallbackAlbumId || !isUuid(fallbackAlbumId)) {
      return NextResponse.json(
        {
          error:
            "Informe um lugar de destino para fotos sem GPS (fallback_album_id).",
        },
        { status: 400 },
      );
    }

    const assigned = await assignPhotosToAlbumsInExperience(
      supabase,
      experienceId,
      photos,
      fallbackAlbumId,
    );
    if ("error" in assigned) {
      return NextResponse.json({ error: assigned.error }, { status: 400 });
    }
    albumByPhotoId = new Map(assigned.albumByPhotoId);
  } else {
    for (const photo of photos) {
      if (!photo.album_id || !isUuid(photo.album_id)) {
        return NextResponse.json(
          { error: "Cada foto precisa de um lugar (album_id)." },
          { status: 400 },
        );
      }
      albumByPhotoId.set(photo.id, photo.album_id);
    }
  }

  const albumIds = [...new Set(albumByPhotoId.values())];
  const albumsResult = await supabase
    .from("albums")
    .select("id, name, source_moment_id")
    .eq("experience_id", experienceId)
    .in("id", albumIds);

  if (albumsResult.error || (albumsResult.data ?? []).length !== albumIds.length) {
    return NextResponse.json(
      { error: "Um ou mais lugares de destino são inválidos." },
      { status: 400 },
    );
  }

  const albumsById = new Map(
    (albumsResult.data ?? []).map((album) => [album.id as string, album]),
  );

  const momentByAlbumId = new Map<string, string>();
  for (const albumId of albumIds) {
    const album = albumsById.get(albumId);
    if (!album) continue;
    const ensured = await ensureAlbumMomentId(supabase, experienceId, {
      id: album.id as string,
      name: album.name as string,
      source_moment_id: (album.source_moment_id as string | null) ?? null,
    });
    if (ensured.error || !ensured.momentId) {
      return NextResponse.json(
        { error: ensured.error ?? "Falha ao preparar o lugar." },
        { status: 400 },
      );
    }
    momentByAlbumId.set(albumId, ensured.momentId);
  }

  const nextPositionByAlbum = new Map<string, number>();
  for (const albumId of albumIds) {
    const maxPos = await supabase
      .from("photos")
      .select("position_in_album")
      .eq("album_id", albumId)
      .order("position_in_album", { ascending: false })
      .limit(1);
    nextPositionByAlbum.set(
      albumId,
      (maxPos.data?.[0]?.position_in_album ?? 0) + 1,
    );
  }

  const nextPositionByMoment = new Map<string, number>();
  for (const momentId of new Set(momentByAlbumId.values())) {
    const maxPos = await supabase
      .from("photos")
      .select("position_in_moment")
      .eq("moment_id", momentId)
      .order("position_in_moment", { ascending: false })
      .limit(1);
    nextPositionByMoment.set(
      momentId,
      (maxPos.data?.[0]?.position_in_moment ?? 0) + 1,
    );
  }

  const rows = [];
  for (const photo of photos) {
    if (!isUuid(photo.id)) {
      return NextResponse.json(
        { error: "Identificador de foto inválido." },
        { status: 400 },
      );
    }
    const albumId = albumByPhotoId.get(photo.id);
    if (!albumId) {
      return NextResponse.json(
        { error: "Não foi possível associar a foto a um lugar." },
        { status: 400 },
      );
    }
    const momentId = momentByAlbumId.get(albumId);
    if (!momentId) {
      return NextResponse.json(
        { error: "Lugar de destino inválido." },
        { status: 400 },
      );
    }

    const albumPos = nextPositionByAlbum.get(albumId) ?? 1;
    const momentPos = nextPositionByMoment.get(momentId) ?? 1;
    nextPositionByAlbum.set(albumId, albumPos + 1);
    nextPositionByMoment.set(momentId, momentPos + 1);

    const lat = photo.exact_latitude;
    const lng = photo.exact_longitude;
    const hasGps =
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng);

    rows.push({
      id: photo.id,
      experience_id: experienceId,
      moment_id: momentId,
      album_id: albumId,
      position_in_moment: momentPos,
      position_in_album: albumPos,
      captured_at: photo.captured_at ?? null,
      date_source: photo.date_source ?? "absent",
      exact_latitude: hasGps ? lat : null,
      exact_longitude: hasGps ? lng : null,
      width: photo.width ?? null,
      height: photo.height ?? null,
      bytes: photo.bytes ?? null,
      format: photo.format ?? null,
    });
  }

  const inserted = await supabase
    .from("photos")
    .insert(rows)
    .select(
      "id, experience_id, album_id, moment_id, position_in_album, position_in_moment, captured_at, width, height, exact_latitude, exact_longitude",
    );

  if (inserted.error || !inserted.data) {
    return NextResponse.json(
      { error: inserted.error?.message ?? "Falha ao adicionar fotos." },
      { status: 400 },
    );
  }

  // Name newly created generic places (same Experience). Never blocks add-photos.
  if (placement === "gps") {
    try {
      await identifyExperiencePlaces(supabase, experienceId);
    } catch {
      // Keep Lugar N fallback when Nominatim is unavailable.
    }
  }

  return NextResponse.json({ photos: inserted.data }, { status: 201 });
}

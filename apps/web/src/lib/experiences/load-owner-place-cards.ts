/**
 * Profile grid cards = root place albums (pastas), not whole Experiences.
 * One import trip with 3 countries → 3 cards on /perfil.
 */

import {
  countryCodeFromPlaceLabel,
  resolveLocationDisplayName,
} from "@moments-forever/shared";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

export interface OwnerPlaceCardItem {
  readonly albumId: string;
  readonly experienceId: string;
  readonly experienceSlug: string;
  readonly experienceTitle: string;
  readonly title: string;
  /** ISO 3166-1 alpha-2 from place label country, when known. */
  readonly countryCode: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly coverPhotoId: string | null;
  readonly previewPhotoIds: readonly string[];
  readonly photoCount: number;
}

type PlaceLink = {
  readonly name: string;
  readonly confirmed: boolean;
};

type AlbumRow = {
  readonly id: string;
  readonly experience_id: string;
  readonly name: string;
  readonly cover_photo_id: string | null;
  readonly position: number;
  readonly source_moment_id: string | null;
  readonly moment?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function placeLinkFromEmbed(momentEmbed: unknown): PlaceLink | null {
  const moment = asRecord(momentEmbed);
  if (!moment) return null;
  const place = asRecord(moment.place);
  if (!place || typeof place.name !== "string") return null;
  return {
    name: place.name,
    confirmed: Boolean(place.confirmed_by_user),
  };
}

function toAlbumRow(row: Record<string, unknown>): AlbumRow {
  return {
    id: row.id as string,
    experience_id: row.experience_id as string,
    name: row.name as string,
    cover_photo_id: (row.cover_photo_id as string | null) ?? null,
    position: row.position as number,
    source_moment_id: (row.source_moment_id as string | null) ?? null,
    moment: row.moment,
  };
}

export async function loadOwnerPlaceCards(
  supabase: ServerSupabase,
  ownerId: string,
): Promise<
  | { readonly places: readonly OwnerPlaceCardItem[]; readonly error: null }
  | { readonly places: null; readonly error: string }
> {
  // Stage 1: tiny experiences list (ids + labels only).
  const experiences = await supabase
    .from("experiences")
    .select("id, slug, title")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (experiences.error) {
    return { places: null, error: experiences.error.message };
  }

  const experienceRows = experiences.data ?? [];
  if (experienceRows.length === 0) {
    return { places: [], error: null };
  }

  const experienceIds = experienceRows.map((row) => row.id as string);
  const experienceById = new Map(
    experienceRows.map((row) => [
      row.id as string,
      {
        slug: row.slug as string,
        title: row.title as string,
      },
    ]),
  );

  // Stage 2: albums (+ nested place) and photo stats in parallel — 1 RT each.
  const [albumsResult, photosResult] = await Promise.all([
    supabase
      .from("albums")
      .select(
        `
        id,
        experience_id,
        name,
        cover_photo_id,
        position,
        source_moment_id,
        moment:moments!albums_source_moment_fkey (
          place:places (
            name,
            confirmed_by_user
          )
        )
      `,
      )
      .in("experience_id", experienceIds)
      .is("parent_album_id", null)
      .order("position", { ascending: true }),
    supabase
      .from("photos")
      .select("album_id, captured_at")
      .in("experience_id", experienceIds),
  ]);

  // If the embed isn't available in this DB, fall back without place joins.
  let albumRows: AlbumRow[] = (albumsResult.data ?? []).map((row) =>
    toAlbumRow(row as Record<string, unknown>),
  );
  let placeNameByMomentId = new Map<string, PlaceLink>();

  if (albumsResult.error) {
    const fallbackAlbums = await supabase
      .from("albums")
      .select(
        "id, experience_id, name, cover_photo_id, position, source_moment_id",
      )
      .in("experience_id", experienceIds)
      .is("parent_album_id", null)
      .order("position", { ascending: true });

    if (fallbackAlbums.error) {
      return { places: null, error: fallbackAlbums.error.message };
    }
    albumRows = (fallbackAlbums.data ?? []).map((row) =>
      toAlbumRow(row as Record<string, unknown>),
    );
    placeNameByMomentId = await loadPlaceNamesByMoment(
      supabase,
      albumRows.map((album) => album.source_moment_id),
    );
  } else {
    for (const album of albumRows) {
      const momentId = album.source_moment_id;
      if (!momentId) continue;
      const link = placeLinkFromEmbed(
        Array.isArray(album.moment) ? album.moment[0] : album.moment,
      );
      if (link) placeNameByMomentId.set(momentId, link);
    }
  }

  if (photosResult.error) {
    return { places: null, error: photosResult.error.message };
  }

  const statsByAlbum = new Map<
    string,
    { count: number; startsAt: string | null; endsAt: string | null }
  >();
  for (const photo of photosResult.data ?? []) {
    const albumId = photo.album_id as string | null;
    if (!albumId) continue;
    const capturedAt = (photo.captured_at as string | null) ?? null;
    const current = statsByAlbum.get(albumId) ?? {
      count: 0,
      startsAt: null,
      endsAt: null,
    };
    current.count += 1;
    if (capturedAt) {
      if (!current.startsAt || capturedAt < current.startsAt) {
        current.startsAt = capturedAt;
      }
      if (!current.endsAt || capturedAt > current.endsAt) {
        current.endsAt = capturedAt;
      }
    }
    statsByAlbum.set(albumId, current);
  }

  const places: OwnerPlaceCardItem[] = albumRows.map((album) => {
    const experienceId = album.experience_id;
    const experience = experienceById.get(experienceId);
    const stats = statsByAlbum.get(album.id);
    const coverPhotoId = album.cover_photo_id;
    const momentId = album.source_moment_id;
    const linkedPlace = momentId ? placeNameByMomentId.get(momentId) : null;
    const title = resolveLocationDisplayName({
      albumName: album.name,
      placeName: linkedPlace?.name ?? null,
      placeConfirmedByUser: linkedPlace?.confirmed ?? false,
    });
    const countryCode =
      countryCodeFromPlaceLabel(title) ??
      countryCodeFromPlaceLabel(linkedPlace?.name);

    return {
      albumId: album.id,
      experienceId,
      experienceSlug: experience?.slug ?? "",
      experienceTitle: experience?.title ?? title,
      title,
      countryCode,
      startsAt: stats?.startsAt ?? null,
      endsAt: stats?.endsAt ?? null,
      coverPhotoId,
      previewPhotoIds: coverPhotoId ? [coverPhotoId] : [],
      photoCount: stats?.count ?? 0,
    };
  });

  places.sort((a, b) => comparePlaceRecency(a, b));

  return { places, error: null };
}

async function loadPlaceNamesByMoment(
  supabase: ServerSupabase,
  momentIdsRaw: readonly (string | null)[],
): Promise<Map<string, PlaceLink>> {
  const placeNameByMomentId = new Map<string, PlaceLink>();
  const momentIds = [
    ...new Set(momentIdsRaw.filter((id): id is string => Boolean(id))),
  ];
  if (momentIds.length === 0) return placeNameByMomentId;

  const moments = await supabase
    .from("moments")
    .select("id, place_id")
    .in("id", momentIds);
  const placeIds = [
    ...new Set(
      (moments.data ?? [])
        .map((moment) => moment.place_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (placeIds.length === 0) return placeNameByMomentId;

  const places = await supabase
    .from("places")
    .select("id, name, confirmed_by_user")
    .in("id", placeIds);
  const placesById = new Map<string, PlaceLink>();
  for (const place of places.data ?? []) {
    placesById.set(place.id as string, {
      name: place.name as string,
      confirmed: Boolean(place.confirmed_by_user),
    });
  }
  for (const moment of moments.data ?? []) {
    const placeId = moment.place_id as string | null;
    if (!placeId) continue;
    const place = placesById.get(placeId);
    if (place) placeNameByMomentId.set(moment.id as string, place);
  }
  return placeNameByMomentId;
}

export function comparePlaceRecency(
  a: Pick<OwnerPlaceCardItem, "startsAt" | "endsAt" | "title">,
  b: Pick<OwnerPlaceCardItem, "startsAt" | "endsAt" | "title">,
): number {
  const ta = a.endsAt ?? a.startsAt ?? "";
  const tb = b.endsAt ?? b.startsAt ?? "";
  if (!ta && !tb) return a.title.localeCompare(b.title, "pt");
  if (!ta) return 1;
  if (!tb) return -1;
  if (ta !== tb) return tb.localeCompare(ta);
  return a.title.localeCompare(b.title, "pt");
}

/**
 * Profile grid cards = root place albums (pastas), not whole Experiences.
 * One import trip with 3 countries → 3 cards on /perfil.
 */

import {
  countryCodeFromPlaceLabel,
  resolveLocationDisplayName,
} from "@moments-forever/shared";
import { connection } from "next/server";

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

export async function loadOwnerPlaceCards(
  supabase: ServerSupabase,
  ownerId: string,
): Promise<
  | { readonly places: readonly OwnerPlaceCardItem[]; readonly error: null }
  | { readonly places: null; readonly error: string }
> {
  await connection();

  const experiences = await supabase
    .from("experiences")
    .select("id, slug, title, created_at")
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
        createdAt: row.created_at as string,
      },
    ]),
  );

  const albums = await supabase
    .from("albums")
    .select(
      "id, experience_id, name, cover_photo_id, position, source_moment_id, created_at",
    )
    .in("experience_id", experienceIds)
    .is("parent_album_id", null)
    .order("position", { ascending: true });

  if (albums.error) {
    return { places: null, error: albums.error.message };
  }

  const albumRows = albums.data ?? [];
  const momentIds = [
    ...new Set(
      albumRows
        .map((album) => album.source_moment_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const placeNameByMomentId = new Map<
    string,
    { readonly name: string; readonly confirmed: boolean }
  >();
  if (momentIds.length > 0) {
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
    const placesById = new Map<
      string,
      { readonly name: string; readonly confirmed: boolean }
    >();
    if (placeIds.length > 0) {
      const places = await supabase
        .from("places")
        .select("id, name, confirmed_by_user")
        .in("id", placeIds);
      for (const place of places.data ?? []) {
        placesById.set(place.id as string, {
          name: place.name as string,
          confirmed: Boolean(place.confirmed_by_user),
        });
      }
    }
    for (const moment of moments.data ?? []) {
      const placeId = moment.place_id as string | null;
      if (!placeId) continue;
      const place = placesById.get(placeId);
      if (place) {
        placeNameByMomentId.set(moment.id as string, place);
      }
    }
  }

  const photos = await supabase
    .from("photos")
    .select("id, album_id, captured_at, position_in_album")
    .in("experience_id", experienceIds)
    .order("position_in_album", { ascending: true });

  if (photos.error) {
    return { places: null, error: photos.error.message };
  }

  const photosByAlbum = new Map<
    string,
    { id: string; capturedAt: string | null }[]
  >();
  for (const photo of photos.data ?? []) {
    const albumId = photo.album_id as string | null;
    if (!albumId) continue;
    const list = photosByAlbum.get(albumId) ?? [];
    list.push({
      id: photo.id as string,
      capturedAt: (photo.captured_at as string | null) ?? null,
    });
    photosByAlbum.set(albumId, list);
  }

  const places: OwnerPlaceCardItem[] = albumRows.map((album) => {
    const experienceId = album.experience_id as string;
    const experience = experienceById.get(experienceId);
    const albumPhotos = photosByAlbum.get(album.id as string) ?? [];
    const captured = albumPhotos
      .map((photo) => photo.capturedAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    const previewPhotoIds = albumPhotos.slice(0, 4).map((photo) => photo.id);
    const coverPhotoId =
      (album.cover_photo_id as string | null) ?? previewPhotoIds[0] ?? null;
    const momentId = album.source_moment_id as string | null;
    const linkedPlace = momentId ? placeNameByMomentId.get(momentId) : null;
    const title = resolveLocationDisplayName({
      albumName: album.name as string,
      placeName: linkedPlace?.name ?? null,
      placeConfirmedByUser: linkedPlace?.confirmed ?? false,
    });
    // Prefer the visible title (user short names like "dubai") then geocoded place.
    const countryCode =
      countryCodeFromPlaceLabel(title) ??
      countryCodeFromPlaceLabel(linkedPlace?.name);

    return {
      albumId: album.id as string,
      experienceId,
      experienceSlug: experience?.slug ?? "",
      experienceTitle: experience?.title ?? title,
      title,
      countryCode,
      startsAt: captured[0] ?? null,
      endsAt: captured[captured.length - 1] ?? null,
      coverPhotoId,
      previewPhotoIds:
        coverPhotoId && !previewPhotoIds.includes(coverPhotoId)
          ? [coverPhotoId, ...previewPhotoIds].slice(0, 4)
          : previewPhotoIds,
      photoCount: albumPhotos.length,
    };
  });

  // Newest experiences first; within the same experience keep album position.
  places.sort((a, b) => {
    const expA = experienceById.get(a.experienceId)?.createdAt ?? "";
    const expB = experienceById.get(b.experienceId)?.createdAt ?? "";
    if (expA !== expB) return expB.localeCompare(expA);
    return 0;
  });

  return { places, error: null };
}

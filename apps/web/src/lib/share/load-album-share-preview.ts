/**
 * Public album share preview (WhatsApp / Open Graph).
 * RLS decides what an anonymous crawler can see — never the session cookie.
 */

import { resolveLocationDisplayName } from "@moments-forever/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  pickAlbumShareCoverPhotoId,
  type AlbumSharePreview,
} from "@/lib/share/album-share-preview";

type PhotoRow = {
  readonly id: string;
  readonly storage_key: string | null;
  readonly thumbnail_storage_key: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly position_in_album: number | null;
  readonly position_in_moment: number;
};

export type AlbumCoverPhoto = {
  readonly id: string;
  readonly storageKey: string | null;
  readonly thumbnailStorageKey: string | null;
  readonly width: number | null;
  readonly height: number | null;
};

function hasStoredFile(row: PhotoRow): boolean {
  return Boolean(
    row.storage_key?.trim() || row.thumbnail_storage_key?.trim(),
  );
}

function toCoverPhoto(row: PhotoRow): AlbumCoverPhoto {
  return {
    id: row.id,
    storageKey: row.storage_key,
    thumbnailStorageKey: row.thumbnail_storage_key,
    width: row.width,
    height: row.height,
  };
}

const PHOTO_COVER_COLUMNS =
  "id, storage_key, thumbnail_storage_key, width, height, position_in_album, position_in_moment";

export async function resolveAlbumCoverPhoto(
  supabase: SupabaseClient,
  album: {
    readonly id: string;
    readonly experienceId: string;
    readonly coverPhotoId: string | null;
  },
): Promise<AlbumCoverPhoto | null> {
  if (album.coverPhotoId) {
    const chosen = await supabase
      .from("photos")
      .select(PHOTO_COVER_COLUMNS)
      .eq("id", album.coverPhotoId)
      .eq("experience_id", album.experienceId)
      .maybeSingle();
    const row = (chosen.data as PhotoRow | null) ?? null;
    if (row && hasStoredFile(row)) {
      return toCoverPhoto(row);
    }
  }

  const photosResult = await supabase
    .from("photos")
    .select(PHOTO_COVER_COLUMNS)
    .eq("album_id", album.id)
    .eq("experience_id", album.experienceId)
    .order("position_in_album")
    .order("position_in_moment")
    .limit(24);

  const photos = (photosResult.data ?? []) as PhotoRow[];
  const coverId = pickAlbumShareCoverPhotoId(
    album.coverPhotoId,
    photos.map((photo) => ({
      id: photo.id,
      hasFile: hasStoredFile(photo),
      positionInAlbum: photo.position_in_album,
      positionInMoment: photo.position_in_moment,
    })),
  );
  if (!coverId) return null;
  const fallback = photos.find((photo) => photo.id === coverId);
  return fallback ? toCoverPhoto(fallback) : null;
}

async function albumDisplayName(
  supabase: SupabaseClient,
  album: {
    readonly name: string;
    readonly position: number;
    readonly source_moment_id: string | null;
  },
): Promise<string> {
  let placeName: string | null = null;
  let placeConfirmedByUser = false;

  if (album.source_moment_id) {
    const moment = await supabase
      .from("moments")
      .select("place_id")
      .eq("id", album.source_moment_id)
      .maybeSingle();
    const placeId = (moment.data?.place_id as string | null) ?? null;
    if (placeId) {
      const place = await supabase
        .from("places")
        .select("name, confirmed_by_user")
        .eq("id", placeId)
        .maybeSingle();
      placeName = (place.data?.name as string | null) ?? null;
      placeConfirmedByUser = Boolean(place.data?.confirmed_by_user);
    }
  }

  return resolveLocationDisplayName({
    albumName: album.name,
    placeName,
    placeConfirmedByUser,
    fallbackIndex: album.position,
  });
}

export async function loadAlbumSharePreview(
  supabase: SupabaseClient,
  tripSlug: string,
  albumId: string,
): Promise<AlbumSharePreview | null> {
  const experienceResult = await supabase
    .from("experiences")
    .select("id, slug, title, description")
    .eq("slug", tripSlug)
    .maybeSingle();
  if (experienceResult.error || !experienceResult.data) return null;

  const experience = experienceResult.data;
  const albumResult = await supabase
    .from("albums")
    .select(
      "id, experience_id, name, description, cover_photo_id, position, source_moment_id",
    )
    .eq("id", albumId)
    .eq("experience_id", experience.id)
    .maybeSingle();
  if (albumResult.error || !albumResult.data) return null;

  const album = albumResult.data;
  const [title, cover] = await Promise.all([
    albumDisplayName(supabase, {
      name: album.name as string,
      position: album.position as number,
      source_moment_id: (album.source_moment_id as string | null) ?? null,
    }),
    resolveAlbumCoverPhoto(supabase, {
      id: album.id as string,
      experienceId: album.experience_id as string,
      coverPhotoId: (album.cover_photo_id as string | null) ?? null,
    }),
  ]);

  const story = (album.description as string | null)?.trim() || "";
  const tripTitle = (experience.title as string).trim();
  const description =
    story || `${title} · ${tripTitle} no Moments Forever.`;

  return {
    tripSlug: experience.slug as string,
    albumId: album.id as string,
    title,
    description,
    coverPhotoId: cover?.id ?? null,
    coverWidth: cover?.width ?? null,
    coverHeight: cover?.height ?? null,
  };
}

export async function loadPublicAlbumCover(
  supabase: SupabaseClient,
  albumId: string,
): Promise<AlbumCoverPhoto | null> {
  const albumResult = await supabase
    .from("albums")
    .select("id, experience_id, cover_photo_id")
    .eq("id", albumId)
    .maybeSingle();
  if (albumResult.error || !albumResult.data) return null;

  return resolveAlbumCoverPhoto(supabase, {
    id: albumResult.data.id as string,
    experienceId: albumResult.data.experience_id as string,
    coverPhotoId: (albumResult.data.cover_photo_id as string | null) ?? null,
  });
}

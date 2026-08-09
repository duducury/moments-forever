/**
 * Reorganize albums/folders inside an existing Experience.
 * Never mutates photo GPS — only album hierarchy and photo.album_id / moment_id.
 */

import type { ImportOrganizationPlan } from "@moments-forever/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

import { assignPhotosToAlbumsInExperience } from "@/lib/location/assign-photos-to-places";
import { ensureAlbumMomentId } from "@/lib/location/ensure-album-moment";
import { identifyExperiencePlaces } from "@/lib/location/identify-experience-places";

async function nextRootPosition(
  supabase: SupabaseClient,
  experienceId: string,
): Promise<number> {
  const siblings = await supabase
    .from("albums")
    .select("position")
    .eq("experience_id", experienceId)
    .is("parent_album_id", null)
    .order("position", { ascending: false })
    .limit(1);
  return ((siblings.data?.[0]?.position as number | undefined) ?? 0) + 1;
}

async function movePhotosToAlbums(
  supabase: SupabaseClient,
  experienceId: string,
  albumByPhotoId: ReadonlyMap<string, string>,
): Promise<void> {
  const albumIds = [...new Set(albumByPhotoId.values())];
  const albums = await supabase
    .from("albums")
    .select("id, name, source_moment_id")
    .eq("experience_id", experienceId)
    .in("id", albumIds);

  if (albums.error) {
    throw new Error(albums.error.message);
  }

  const momentByAlbumId = new Map<string, string>();
  for (const album of albums.data ?? []) {
    const ensured = await ensureAlbumMomentId(supabase, experienceId, {
      id: album.id as string,
      name: album.name as string,
      source_moment_id: (album.source_moment_id as string | null) ?? null,
    });
    if (ensured.error || !ensured.momentId) {
      throw new Error(ensured.error ?? "Falha ao preparar o lugar.");
    }
    momentByAlbumId.set(album.id as string, ensured.momentId);
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

  for (const [photoId, albumId] of albumByPhotoId) {
    const momentId = momentByAlbumId.get(albumId);
    if (!momentId) {
      throw new Error("Lugar de destino inválido.");
    }
    const albumPos = nextPositionByAlbum.get(albumId) ?? 1;
    const momentPos = nextPositionByMoment.get(momentId) ?? 1;
    nextPositionByAlbum.set(albumId, albumPos + 1);
    nextPositionByMoment.set(momentId, momentPos + 1);

    const updated = await supabase
      .from("photos")
      .update({
        album_id: albumId,
        moment_id: momentId,
        position_in_album: albumPos,
        position_in_moment: momentPos,
      })
      .eq("id", photoId)
      .eq("experience_id", experienceId);

    if (updated.error) {
      throw new Error(updated.error.message);
    }
  }
}

async function deleteEmptyAlbums(
  supabase: SupabaseClient,
  experienceId: string,
  keepAlbumIds: ReadonlySet<string>,
): Promise<void> {
  for (let pass = 0; pass < 8; pass += 1) {
    const albums = await supabase
      .from("albums")
      .select("id, parent_album_id")
      .eq("experience_id", experienceId);

    if (albums.error || !albums.data) return;

    const photos = await supabase
      .from("photos")
      .select("album_id")
      .eq("experience_id", experienceId);

    const photoCounts = new Map<string, number>();
    for (const row of photos.data ?? []) {
      const albumId = row.album_id as string | null;
      if (!albumId) continue;
      photoCounts.set(albumId, (photoCounts.get(albumId) ?? 0) + 1);
    }

    const childCounts = new Map<string, number>();
    for (const album of albums.data) {
      const parentId = album.parent_album_id as string | null;
      if (!parentId) continue;
      childCounts.set(parentId, (childCounts.get(parentId) ?? 0) + 1);
    }

    let deleted = 0;
    for (const album of albums.data) {
      const id = album.id as string;
      if (keepAlbumIds.has(id)) continue;
      if ((photoCounts.get(id) ?? 0) > 0) continue;
      if ((childCounts.get(id) ?? 0) > 0) continue;
      const result = await supabase
        .from("albums")
        .delete()
        .eq("id", id)
        .eq("experience_id", experienceId);
      if (!result.error) deleted += 1;
    }
    if (deleted === 0) return;
  }
}

async function ensureFallbackAlbum(
  supabase: SupabaseClient,
  experienceId: string,
  preferredName: string,
): Promise<string> {
  const existing = await supabase
    .from("albums")
    .select("id")
    .eq("experience_id", experienceId)
    .is("parent_album_id", null)
    .order("position", { ascending: true })
    .limit(1);

  const existingId = existing.data?.[0]?.id as string | undefined;
  if (existingId) return existingId;

  const created = await supabase
    .from("albums")
    .insert({
      experience_id: experienceId,
      parent_album_id: null,
      name: preferredName.trim() || "Viagem",
      description: null,
      position: 1,
    })
    .select("id")
    .single();

  if (created.error || !created.data?.id) {
    throw new Error(
      created.error?.message ?? "Não foi possível criar um lugar.",
    );
  }
  return created.data.id as string;
}

async function organizeSeparate(
  supabase: SupabaseClient,
  experienceId: string,
  rootName: string,
): Promise<void> {
  const photos = await supabase
    .from("photos")
    .select("id, exact_latitude, exact_longitude, album_id")
    .eq("experience_id", experienceId);

  if (photos.error) {
    throw new Error(photos.error.message);
  }

  const rows = photos.data ?? [];
  if (rows.length === 0) return;

  // Flatten hierarchy so new GPS places become root folders.
  await supabase
    .from("albums")
    .update({ parent_album_id: null })
    .eq("experience_id", experienceId)
    .not("parent_album_id", "is", null);

  const fallbackAlbumId = await ensureFallbackAlbum(
    supabase,
    experienceId,
    rootName,
  );

  const assigned = await assignPhotosToAlbumsInExperience(
    supabase,
    experienceId,
    rows.map((row) => ({
      id: row.id as string,
      exact_latitude: (row.exact_latitude as number | null) ?? null,
      exact_longitude: (row.exact_longitude as number | null) ?? null,
    })),
    fallbackAlbumId,
  );

  if ("error" in assigned) {
    throw new Error(assigned.error);
  }

  await movePhotosToAlbums(supabase, experienceId, assigned.albumByPhotoId);
  await deleteEmptyAlbums(
    supabase,
    experienceId,
    new Set(assigned.albumByPhotoId.values()),
  );

  try {
    await identifyExperiencePlaces(supabase, experienceId);
  } catch {
    // Keep generic names when Nominatim is unavailable.
  }
}

async function organizeSingle(
  supabase: SupabaseClient,
  experienceId: string,
  rootName: string,
): Promise<void> {
  const name = rootName.trim() || "Viagem";
  const photos = await supabase
    .from("photos")
    .select("id")
    .eq("experience_id", experienceId);

  if (photos.error) {
    throw new Error(photos.error.message);
  }

  const photoIds = (photos.data ?? []).map((row) => row.id as string);
  if (photoIds.length === 0) return;

  const roots = await supabase
    .from("albums")
    .select("id")
    .eq("experience_id", experienceId)
    .is("parent_album_id", null)
    .order("position", { ascending: true })
    .limit(1);

  let targetId = roots.data?.[0]?.id as string | undefined;
  if (!targetId) {
    targetId = await ensureFallbackAlbum(supabase, experienceId, name);
  } else {
    await supabase
      .from("albums")
      .update({ name, parent_album_id: null })
      .eq("id", targetId)
      .eq("experience_id", experienceId);
  }

  // Detach other albums from hierarchy before consolidating photos.
  await supabase
    .from("albums")
    .update({ parent_album_id: null })
    .eq("experience_id", experienceId)
    .neq("id", targetId);

  const albumByPhotoId = new Map(
    photoIds.map((photoId) => [photoId, targetId as string]),
  );
  await movePhotosToAlbums(supabase, experienceId, albumByPhotoId);
  await deleteEmptyAlbums(supabase, experienceId, new Set([targetId]));
}

async function organizeNested(
  supabase: SupabaseClient,
  experienceId: string,
  plan: ImportOrganizationPlan,
): Promise<void> {
  // First ensure GPS-separated root places, then wrap them.
  await organizeSeparate(supabase, experienceId, plan.rootName);

  const roots = await supabase
    .from("albums")
    .select("id, name")
    .eq("experience_id", experienceId)
    .is("parent_album_id", null)
    .order("position", { ascending: true });

  if (roots.error) {
    throw new Error(roots.error.message);
  }

  const rootAlbums = roots.data ?? [];
  if (rootAlbums.length === 0) return;

  const photos = await supabase
    .from("photos")
    .select("id, album_id")
    .eq("experience_id", experienceId);

  if (photos.error) {
    throw new Error(photos.error.message);
  }

  const photosByAlbum = new Map<string, string[]>();
  for (const row of photos.data ?? []) {
    const albumId = row.album_id as string | null;
    if (!albumId) continue;
    const list = photosByAlbum.get(albumId) ?? [];
    list.push(row.id as string);
    photosByAlbum.set(albumId, list);
  }

  const childAlbums = rootAlbums.filter(
    (album) => (photosByAlbum.get(album.id as string) ?? []).length > 0,
  );
  if (childAlbums.length === 0) return;

  // Rename children from the plan when photo membership matches.
  for (const child of plan.children) {
    const sampleId = child.photoIds[0];
    if (!sampleId || !child.name.trim()) continue;
    const photo = (photos.data ?? []).find((row) => row.id === sampleId);
    const albumId = photo?.album_id as string | null | undefined;
    if (!albumId) continue;
    await supabase
      .from("albums")
      .update({ name: child.name.trim() })
      .eq("id", albumId)
      .eq("experience_id", experienceId);
  }

  const position = await nextRootPosition(supabase, experienceId);
  const parent = await supabase
    .from("albums")
    .insert({
      experience_id: experienceId,
      parent_album_id: null,
      name: plan.rootName.trim() || "Viagem",
      description: null,
      position,
    })
    .select("id")
    .single();

  if (parent.error || !parent.data?.id) {
    throw new Error(
      parent.error?.message ?? "Não foi possível criar o lugar principal.",
    );
  }

  const parentId = parent.data.id as string;
  for (const album of childAlbums) {
    const result = await supabase
      .from("albums")
      .update({ parent_album_id: parentId })
      .eq("id", album.id as string)
      .eq("experience_id", experienceId);
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  await deleteEmptyAlbums(
    supabase,
    experienceId,
    new Set([parentId, ...childAlbums.map((album) => album.id as string)]),
  );
}

export async function organizeExperienceAlbums(
  supabase: SupabaseClient,
  experienceId: string,
  plan: ImportOrganizationPlan,
): Promise<void> {
  if (plan.mode === "separate") {
    await organizeSeparate(supabase, experienceId, plan.rootName);
    return;
  }
  if (plan.mode === "single") {
    await organizeSingle(supabase, experienceId, plan.rootName);
    return;
  }
  await organizeNested(supabase, experienceId, plan);
}

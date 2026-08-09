/**
 * Merge selected albums inside one Experience.
 * - photos: move all images into one destination album (no GPS changes)
 * - nested: wrap selected albums as siblings under a new parent folder
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureAlbumMomentId } from "@/lib/location/ensure-album-moment";

export type MergeAlbumsMode = "photos" | "nested";

export interface MergeAlbumsInput {
  readonly mode: MergeAlbumsMode;
  readonly albumIds: readonly string[];
  /** Destination album for photos mode (must be one of albumIds). */
  readonly targetAlbumId?: string;
  /** Optional rename for destination (photos) or new parent (nested). */
  readonly name?: string;
}

async function movePhotosToAlbum(
  supabase: SupabaseClient,
  experienceId: string,
  photoIds: readonly string[],
  targetAlbumId: string,
): Promise<void> {
  if (photoIds.length === 0) return;

  const album = await supabase
    .from("albums")
    .select("id, name, source_moment_id")
    .eq("id", targetAlbumId)
    .eq("experience_id", experienceId)
    .maybeSingle();

  if (album.error || !album.data) {
    throw new Error("Álbum de destino inválido.");
  }

  const ensured = await ensureAlbumMomentId(supabase, experienceId, {
    id: album.data.id as string,
    name: album.data.name as string,
    source_moment_id: (album.data.source_moment_id as string | null) ?? null,
  });
  if (ensured.error || !ensured.momentId) {
    throw new Error(ensured.error ?? "Falha ao preparar o lugar.");
  }

  const [maxAlbum, maxMoment] = await Promise.all([
    supabase
      .from("photos")
      .select("position_in_album")
      .eq("album_id", targetAlbumId)
      .order("position_in_album", { ascending: false })
      .limit(1),
    supabase
      .from("photos")
      .select("position_in_moment")
      .eq("moment_id", ensured.momentId)
      .order("position_in_moment", { ascending: false })
      .limit(1),
  ]);

  let albumPos = (maxAlbum.data?.[0]?.position_in_album ?? 0) + 1;
  let momentPos = (maxMoment.data?.[0]?.position_in_moment ?? 0) + 1;

  for (const photoId of photoIds) {
    const updated = await supabase
      .from("photos")
      .update({
        album_id: targetAlbumId,
        moment_id: ensured.momentId,
        position_in_album: albumPos,
        position_in_moment: momentPos,
      })
      .eq("id", photoId)
      .eq("experience_id", experienceId);

    if (updated.error) {
      throw new Error(updated.error.message);
    }
    albumPos += 1;
    momentPos += 1;
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

function collectDescendantIds(
  albums: readonly {
    readonly id: string;
    readonly parent_album_id: string | null;
  }[],
  roots: ReadonlySet<string>,
): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const album of albums) {
    const parent = album.parent_album_id;
    if (!parent) continue;
    const list = byParent.get(parent) ?? [];
    list.push(album.id);
    byParent.set(parent, list);
  }

  const all = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || all.has(id)) continue;
    all.add(id);
    for (const child of byParent.get(id) ?? []) {
      stack.push(child);
    }
  }
  return all;
}

export async function mergeAlbumsInExperience(
  supabase: SupabaseClient,
  experienceId: string,
  input: MergeAlbumsInput,
): Promise<{ readonly targetAlbumId: string }> {
  const uniqueIds = [...new Set(input.albumIds.filter(Boolean))];
  if (uniqueIds.length < 2) {
    throw new Error("Selecione pelo menos dois lugares para juntar.");
  }

  const albums = await supabase
    .from("albums")
    .select("id, name, parent_album_id, position")
    .eq("experience_id", experienceId)
    .in("id", uniqueIds);

  if (albums.error) {
    throw new Error(albums.error.message);
  }
  if ((albums.data?.length ?? 0) !== uniqueIds.length) {
    throw new Error("Um ou mais lugares não pertencem a esta viagem.");
  }

  if (input.mode === "nested") {
    const parentName =
      input.name?.trim() ||
      albums.data?.map((a) => a.name as string).join(" · ") ||
      "Lugares";

    const siblings = await supabase
      .from("albums")
      .select("position")
      .eq("experience_id", experienceId)
      .is("parent_album_id", null)
      .order("position", { ascending: false })
      .limit(1);
    const nextPosition = ((siblings.data?.[0]?.position as number) ?? 0) + 1;

    const created = await supabase
      .from("albums")
      .insert({
        experience_id: experienceId,
        parent_album_id: null,
        name: parentName,
        description: null,
        position: nextPosition,
      })
      .select("id")
      .single();

    if (created.error || !created.data?.id) {
      throw new Error(created.error?.message ?? "Falha ao criar pasta pai.");
    }

    const parentId = created.data.id as string;
    let childPosition = 1;
    for (const albumId of uniqueIds) {
      const updated = await supabase
        .from("albums")
        .update({
          parent_album_id: parentId,
          position: childPosition,
        })
        .eq("id", albumId)
        .eq("experience_id", experienceId);
      if (updated.error) {
        throw new Error(updated.error.message);
      }
      childPosition += 1;
    }

    return { targetAlbumId: parentId };
  }

  // mode === "photos"
  const targetAlbumId = input.targetAlbumId ?? uniqueIds[0];
  if (!targetAlbumId || !uniqueIds.includes(targetAlbumId)) {
    throw new Error("Álbum de destino inválido.");
  }

  if (input.name?.trim()) {
    const renamed = await supabase
      .from("albums")
      .update({ name: input.name.trim() })
      .eq("id", targetAlbumId)
      .eq("experience_id", experienceId);
    if (renamed.error) {
      throw new Error(renamed.error.message);
    }
  }

  const allAlbums = await supabase
    .from("albums")
    .select("id, parent_album_id")
    .eq("experience_id", experienceId);

  if (allAlbums.error) {
    throw new Error(allAlbums.error.message);
  }

  const treeIds = collectDescendantIds(
    (allAlbums.data ?? []).map((row) => ({
      id: row.id as string,
      parent_album_id: (row.parent_album_id as string | null) ?? null,
    })),
    new Set(uniqueIds),
  );

  const photos = await supabase
    .from("photos")
    .select("id, album_id")
    .eq("experience_id", experienceId)
    .in("album_id", [...treeIds]);

  if (photos.error) {
    throw new Error(photos.error.message);
  }

  const photoIds = (photos.data ?? [])
    .filter((row) => (row.album_id as string) !== targetAlbumId)
    .map((row) => row.id as string);

  await movePhotosToAlbum(supabase, experienceId, photoIds, targetAlbumId);

  // Re-parent children of merged albums onto the destination, then prune empties.
  for (const albumId of uniqueIds) {
    if (albumId === targetAlbumId) continue;
    const children = await supabase
      .from("albums")
      .select("id")
      .eq("experience_id", experienceId)
      .eq("parent_album_id", albumId);
    for (const child of children.data ?? []) {
      await supabase
        .from("albums")
        .update({ parent_album_id: targetAlbumId })
        .eq("id", child.id as string)
        .eq("experience_id", experienceId);
    }
  }

  await deleteEmptyAlbums(supabase, experienceId, new Set([targetAlbumId]));

  return { targetAlbumId };
}

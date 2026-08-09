/**
 * Post-create album shaping for import organization modes.
 * Never mutates photo GPS / EXIF — only album hierarchy and album_id.
 */

import type { ImportOrganizationPlan } from "@moments-forever/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Wrap separately-created root albums under one parent album (nested mode).
 * Matches children by the album currently holding each photo.
 */
export async function applyNestedImportOrganization(
  supabase: SupabaseClient,
  experienceId: string,
  plan: ImportOrganizationPlan,
): Promise<void> {
  if (plan.mode !== "nested" || plan.children.length === 0) {
    return;
  }

  const albumIds = new Set<string>();
  const renameByAlbumId = new Map<string, string>();

  for (const child of plan.children) {
    const sampleId = child.photoIds[0];
    if (!sampleId) continue;
    const photo = await supabase
      .from("photos")
      .select("album_id")
      .eq("id", sampleId)
      .eq("experience_id", experienceId)
      .maybeSingle();
    const albumId = photo.data?.album_id as string | null | undefined;
    if (!albumId) continue;
    albumIds.add(albumId);
    if (child.name.trim()) {
      renameByAlbumId.set(albumId, child.name.trim());
    }
  }

  if (albumIds.size === 0) return;

  const siblings = await supabase
    .from("albums")
    .select("position")
    .eq("experience_id", experienceId)
    .is("parent_album_id", null)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition = (siblings.data?.[0]?.position as number | undefined) ?? 0;

  const parent = await supabase
    .from("albums")
    .insert({
      experience_id: experienceId,
      parent_album_id: null,
      name: plan.rootName.trim() || "Viagem",
      description: null,
      position: nextPosition + 1,
    })
    .select("id")
    .single();

  if (parent.error || !parent.data?.id) {
    throw new Error(
      parent.error?.message ?? "Não foi possível criar o lugar principal.",
    );
  }

  const parentId = parent.data.id as string;

  for (const albumId of albumIds) {
    const name = renameByAlbumId.get(albumId);
    const update: { parent_album_id: string; name?: string } = {
      parent_album_id: parentId,
    };
    if (name) update.name = name;

    const result = await supabase
      .from("albums")
      .update(update)
      .eq("id", albumId)
      .eq("experience_id", experienceId);

    if (result.error) {
      throw new Error(result.error.message);
    }
  }
}

/**
 * After single-mode create, ensure the root album uses the chosen name.
 */
export async function renameSingleRootAlbum(
  supabase: SupabaseClient,
  experienceId: string,
  rootName: string,
): Promise<void> {
  const name = rootName.trim();
  if (!name) return;

  const roots = await supabase
    .from("albums")
    .select("id")
    .eq("experience_id", experienceId)
    .is("parent_album_id", null)
    .order("position", { ascending: true })
    .limit(1);

  const albumId = roots.data?.[0]?.id as string | undefined;
  if (!albumId) return;

  await supabase
    .from("albums")
    .update({ name })
    .eq("id", albumId)
    .eq("experience_id", experienceId);

  // Keep linked place name in sync when the moment still points at a place.
  const album = await supabase
    .from("albums")
    .select("source_moment_id")
    .eq("id", albumId)
    .maybeSingle();
  const momentId = album.data?.source_moment_id as string | null | undefined;
  if (!momentId) return;

  const moment = await supabase
    .from("moments")
    .select("place_id")
    .eq("id", momentId)
    .maybeSingle();
  const placeId = moment.data?.place_id as string | null | undefined;
  if (!placeId) return;

  await supabase
    .from("places")
    .update({ name, confirmed_by_user: true })
    .eq("id", placeId)
    .eq("experience_id", experienceId);

  await supabase
    .from("moments")
    .update({ title: name })
    .eq("id", momentId)
    .eq("experience_id", experienceId);
}

/**
 * Owner experience list for the profile (/perfil).
 *
 * Uses the same `photos` / `albums` tables as /trip — never the ambiguous
 * PostgREST embed `photos(count)` on experiences (there are two FKs between
 * experiences and photos: experience_id and cover_photo_id).
 */

import { connection } from "next/server";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

export interface OwnerExperienceListItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly coverPhotoId: string | null;
  /** First photo ids for card previews (same ids /trip uses). */
  readonly previewPhotoIds: readonly string[];
  readonly createdAt: string;
  readonly photoCount: number;
  readonly placeCount: number;
}

async function loadPhotoStats(
  supabase: ServerSupabase,
  experienceIds: readonly string[],
): Promise<{
  readonly previewByExperience: Map<string, string[]>;
  readonly countByExperience: Map<string, number>;
}> {
  const previewByExperience = new Map<string, string[]>();
  const countByExperience = new Map<string, number>();
  if (experienceIds.length === 0) {
    return { previewByExperience, countByExperience };
  }

  // Same query shape as /trip/[slug]: photos filtered by experience_id.
  const result = await supabase
    .from("photos")
    .select("id, experience_id, position_in_album, position_in_moment")
    .in("experience_id", [...experienceIds])
    .order("position_in_album", { ascending: true })
    .order("position_in_moment", { ascending: true });

  if (result.error || !result.data) {
    return { previewByExperience, countByExperience };
  }

  for (const row of result.data) {
    const experienceId = row.experience_id as string;
    const photoId = row.id as string;
    countByExperience.set(
      experienceId,
      (countByExperience.get(experienceId) ?? 0) + 1,
    );
    const list = previewByExperience.get(experienceId) ?? [];
    if (list.length < 4) {
      list.push(photoId);
      previewByExperience.set(experienceId, list);
    }
  }

  return { previewByExperience, countByExperience };
}

async function loadAlbumCounts(
  supabase: ServerSupabase,
  experienceIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (experienceIds.length === 0) return counts;

  // Root places only (parent_album_id is null) — matches "Lugares" on the trip page.
  const result = await supabase
    .from("albums")
    .select("experience_id")
    .in("experience_id", [...experienceIds])
    .is("parent_album_id", null);

  if (result.error || !result.data) return counts;

  for (const row of result.data) {
    const experienceId = row.experience_id as string;
    counts.set(experienceId, (counts.get(experienceId) ?? 0) + 1);
  }
  return counts;
}

export async function loadOwnerExperiences(
  supabase: ServerSupabase,
  ownerId: string,
): Promise<
  | { readonly experiences: readonly OwnerExperienceListItem[]; readonly error: null }
  | { readonly experiences: null; readonly error: string }
> {
  await connection();

  // No photos(...) embed — PostgREST cannot disambiguate cover_photo vs experience_id.
  const { data, error } = await supabase
    .from("experiences")
    .select(
      "id, slug, title, starts_at, ends_at, cover_photo_id, created_at",
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    return { experiences: null, error: error.message };
  }

  const rows = data ?? [];
  const experienceIds = rows.map((row) => row.id as string);
  const [{ previewByExperience, countByExperience }, albumCounts] =
    await Promise.all([
      loadPhotoStats(supabase, experienceIds),
      loadAlbumCounts(supabase, experienceIds),
    ]);

  const experiences = rows.map((row) => {
    const id = row.id as string;
    const previewPhotoIds = previewByExperience.get(id) ?? [];
    const coverPhotoId =
      (row.cover_photo_id as string | null) ?? previewPhotoIds[0] ?? null;

    return {
      id,
      slug: row.slug as string,
      title: row.title as string,
      startsAt: (row.starts_at as string | null) ?? null,
      endsAt: (row.ends_at as string | null) ?? null,
      coverPhotoId,
      previewPhotoIds:
        coverPhotoId && !previewPhotoIds.includes(coverPhotoId)
          ? [coverPhotoId, ...previewPhotoIds].slice(0, 4)
          : previewPhotoIds,
      createdAt: row.created_at as string,
      photoCount: countByExperience.get(id) ?? 0,
      placeCount: albumCounts.get(id) ?? 0,
    };
  });

  return { experiences, error: null };
}

/**
 * Public profile slug helpers (/nome).
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

/** Path segments that must never become a profile slug. */
export const RESERVED_PROFILE_SLUGS: ReadonlySet<string> = new Set([
  "login",
  "import",
  "perfil",
  "trip",
  "admin",
  "api",
  "viagens",
  "mapa",
  "geral",
  "passaporte",
  "privacidade",
  "favicon.ico",
  "_next",
  "nome",
]);

export function slugifyDisplayName(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");

  if (!folded) return "perfil";
  if (RESERVED_PROFILE_SLUGS.has(folded)) return `${folded}-user`;
  return folded.slice(0, 48).replace(/-+$/u, "") || "perfil";
}

export function isReservedProfileSlug(slug: string): boolean {
  return RESERVED_PROFILE_SLUGS.has(slug.trim().toLowerCase());
}

export function publicProfilePath(slug: string): string {
  return `/${encodeURIComponent(slug)}`;
}

/** In-app and OG avatar bytes from R2 (empty when the owner has no uploaded avatar). */
export function profileAvatarPublicPath(slug: string): string {
  return `/api/profile/${encodeURIComponent(slug)}/avatar`;
}

export type PublicProfile = {
  readonly id: string;
  readonly profileSlug: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly avatarPhotoId: string | null;
  /** Permanent R2 key when the owner uploaded an avatar for share previews. */
  readonly hasPermanentAvatar: boolean;
};

function mapPublicProfile(row: {
  readonly id: string;
  readonly profile_slug: string;
  readonly display_name: string | null;
  readonly bio: string | null;
  readonly avatar_photo_id: string | null;
  readonly avatar_storage_key?: string | null;
}): PublicProfile {
  return {
    id: row.id,
    profileSlug: row.profile_slug,
    displayName: row.display_name,
    bio: row.bio,
    avatarPhotoId: row.avatar_photo_id,
    hasPermanentAvatar: Boolean(row.avatar_storage_key?.trim()),
  };
}

export async function lookupPublicProfile(
  supabase: ServerSupabase,
  profileSlug: string,
): Promise<PublicProfile | null> {
  const slug = profileSlug.trim().toLowerCase();
  if (!slug || isReservedProfileSlug(slug)) return null;

  // Prefer avatar_storage_key for OG previews. If the migration is not applied
  // yet, PostgREST errors on the unknown column — fall back so the profile
  // page still loads (instead of a hard 404).
  const withAvatarKey = await supabase
    .from("users")
    .select(
      "id, profile_slug, display_name, bio, avatar_photo_id, avatar_storage_key",
    )
    .eq("profile_slug", slug)
    .maybeSingle();

  if (!withAvatarKey.error && withAvatarKey.data?.profile_slug) {
    return mapPublicProfile({
      id: withAvatarKey.data.id as string,
      profile_slug: withAvatarKey.data.profile_slug as string,
      display_name: (withAvatarKey.data.display_name as string | null) ?? null,
      bio: (withAvatarKey.data.bio as string | null) ?? null,
      avatar_photo_id:
        (withAvatarKey.data.avatar_photo_id as string | null) ?? null,
      avatar_storage_key:
        (withAvatarKey.data.avatar_storage_key as string | null) ?? null,
    });
  }

  const fallback = await supabase
    .from("users")
    .select("id, profile_slug, display_name, bio, avatar_photo_id")
    .eq("profile_slug", slug)
    .maybeSingle();

  if (fallback.error || !fallback.data?.profile_slug) return null;

  return mapPublicProfile({
    id: fallback.data.id as string,
    profile_slug: fallback.data.profile_slug as string,
    display_name: (fallback.data.display_name as string | null) ?? null,
    bio: (fallback.data.bio as string | null) ?? null,
    avatar_photo_id: (fallback.data.avatar_photo_id as string | null) ?? null,
    avatar_storage_key: null,
  });
}

export async function getOwnerProfileSlug(
  supabase: ServerSupabase,
  ownerId: string,
): Promise<string | null> {
  const result = await supabase
    .from("users")
    .select("profile_slug")
    .eq("id", ownerId)
    .maybeSingle();

  if (result.error || !result.data?.profile_slug) return null;
  return result.data.profile_slug as string;
}

/** Fast owner profile read by id — one round trip, no slug ensure/write. */
export async function lookupOwnerProfileById(
  supabase: ServerSupabase,
  ownerId: string,
): Promise<PublicProfile | null> {
  const withAvatarKey = await supabase
    .from("users")
    .select(
      "id, profile_slug, display_name, bio, avatar_photo_id, avatar_storage_key",
    )
    .eq("id", ownerId)
    .maybeSingle();

  if (!withAvatarKey.error && withAvatarKey.data?.id) {
    const slug = (withAvatarKey.data.profile_slug as string | null) ?? "";
    if (!slug) return null;
    return mapPublicProfile({
      id: withAvatarKey.data.id as string,
      profile_slug: slug,
      display_name: (withAvatarKey.data.display_name as string | null) ?? null,
      bio: (withAvatarKey.data.bio as string | null) ?? null,
      avatar_photo_id:
        (withAvatarKey.data.avatar_photo_id as string | null) ?? null,
      avatar_storage_key:
        (withAvatarKey.data.avatar_storage_key as string | null) ?? null,
    });
  }

  const fallback = await supabase
    .from("users")
    .select("id, profile_slug, display_name, bio, avatar_photo_id")
    .eq("id", ownerId)
    .maybeSingle();

  if (fallback.error || !fallback.data?.id) return null;
  const slug = (fallback.data.profile_slug as string | null) ?? "";
  if (!slug) return null;

  return mapPublicProfile({
    id: fallback.data.id as string,
    profile_slug: slug,
    display_name: (fallback.data.display_name as string | null) ?? null,
    bio: (fallback.data.bio as string | null) ?? null,
    avatar_photo_id: (fallback.data.avatar_photo_id as string | null) ?? null,
    avatar_storage_key: null,
  });
}

/**
 * Ensure the signed-in owner has a stable public profile_slug + display_name.
 * Does not change an existing slug (keeps shared links stable).
 */
export async function ensureOwnerProfileSlug(
  supabase: ServerSupabase,
  ownerId: string,
  displayName: string,
): Promise<string> {
  const existing = await supabase
    .from("users")
    .select("profile_slug, display_name")
    .eq("id", ownerId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  const currentSlug = (existing.data?.profile_slug as string | null) ?? null;
  const name = displayName.trim() || "Perfil";

  if (currentSlug) {
    if ((existing.data?.display_name as string | null) !== name) {
      await supabase
        .from("users")
        .update({ display_name: name })
        .eq("id", ownerId);
    }
    return currentSlug;
  }

  const base = slugifyDisplayName(name);
  let candidate = base;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const clash = await supabase
      .from("users")
      .select("id")
      .eq("profile_slug", candidate)
      .maybeSingle();

    if (clash.error) {
      throw new Error(clash.error.message);
    }
    if (!clash.data) {
      const updated = await supabase
        .from("users")
        .update({ profile_slug: candidate, display_name: name })
        .eq("id", ownerId)
        .select("profile_slug")
        .maybeSingle();

      if (updated.error) {
        throw new Error(updated.error.message);
      }
      if (updated.data?.profile_slug) {
        return updated.data.profile_slug as string;
      }
    }

    const suffix = Math.random().toString(36).slice(2, 6);
    candidate = `${base}-${suffix}`.slice(0, 56);
  }

  throw new Error("Não foi possível reservar um nome de perfil.");
}

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

export type PublicProfile = {
  readonly id: string;
  readonly profileSlug: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly avatarPhotoId: string | null;
};

export async function lookupPublicProfile(
  supabase: ServerSupabase,
  profileSlug: string,
): Promise<PublicProfile | null> {
  const slug = profileSlug.trim().toLowerCase();
  if (!slug || isReservedProfileSlug(slug)) return null;

  const result = await supabase
    .from("users")
    .select("id, profile_slug, display_name, bio, avatar_photo_id")
    .eq("profile_slug", slug)
    .maybeSingle();

  if (result.error || !result.data?.profile_slug) return null;

  return {
    id: result.data.id as string,
    profileSlug: result.data.profile_slug as string,
    displayName: (result.data.display_name as string | null) ?? null,
    bio: (result.data.bio as string | null) ?? null,
    avatarPhotoId: (result.data.avatar_photo_id as string | null) ?? null,
  };
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

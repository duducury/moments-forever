import { createPresignedGetUrl, getR2Config } from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MediaVariant = "full" | "thumbnail";

export type PhotoStorageKeys = {
  readonly storageKey: string | null;
  readonly thumbnailStorageKey: string | null;
};

type Supabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

const SIGNED_TTL_SECONDS = 60 * 30;
/** Refresh server memo before the signed URL actually expires. */
const SERVER_MEMO_SKEW_MS = 60 * 5 * 1000;

const serverSignedMemo = new Map<
  string,
  { readonly url: string; readonly expiresAtMs: number }
>();

export function normalizeMediaVariant(
  raw: string | null | undefined,
): "original" | "thumbnail" {
  // Client `full` maps to R2 key `original` (MVP preview derivative).
  if (raw === "thumbnail") return "thumbnail";
  return "original";
}

export function storageKeyForVariant(
  keys: PhotoStorageKeys,
  variant: MediaVariant,
): string | null {
  if (variant === "thumbnail") {
    return keys.thumbnailStorageKey ?? keys.storageKey;
  }
  return keys.storageKey ?? keys.thumbnailStorageKey;
}

export async function createMemoizedPresignedGetUrl(
  key: string,
  expiresInSeconds = SIGNED_TTL_SECONDS,
): Promise<{ readonly url: string; readonly expiresAtMs: number }> {
  const now = Date.now();
  const cached = serverSignedMemo.get(key);
  if (cached && cached.expiresAtMs - SERVER_MEMO_SKEW_MS > now) {
    return cached;
  }
  const url = await createPresignedGetUrl({ key, expiresInSeconds });
  const entry = {
    url,
    expiresAtMs: now + expiresInSeconds * 1000,
  };
  serverSignedMemo.set(key, entry);
  return entry;
}

export async function canReadPhoto(
  supabase: Supabase,
  photoId: string,
  userId: string | null,
): Promise<PhotoStorageKeys | null> {
  const plain = await supabase
    .from("photos")
    .select("id, experience_id, storage_key, thumbnail_storage_key")
    .eq("id", photoId)
    .maybeSingle();
  if (plain.error || !plain.data) return null;

  const experience = await supabase
    .from("experiences")
    .select("id, owner_id")
    .eq("id", plain.data.experience_id)
    .maybeSingle();
  if (experience.error || !experience.data) return null;

  const keys: PhotoStorageKeys = {
    storageKey: (plain.data.storage_key as string | null) ?? null,
    thumbnailStorageKey:
      (plain.data.thumbnail_storage_key as string | null) ?? null,
  };

  if (userId && experience.data.owner_id === userId) {
    return keys;
  }

  const owner = await supabase
    .from("users")
    .select("id, profile_slug")
    .eq("id", experience.data.owner_id)
    .maybeSingle();

  if (owner.data?.profile_slug) {
    return keys;
  }

  return null;
}

/**
 * Batch access check for many photos (one album open). Shares auth work and
 * avoids N×(photo+experience+user) round-trips from the redirect route.
 */
export async function canReadPhotos(
  supabase: Supabase,
  photoIds: readonly string[],
  userId: string | null,
): Promise<Map<string, PhotoStorageKeys>> {
  const uniqueIds = [...new Set(photoIds.filter(Boolean))];
  const allowed = new Map<string, PhotoStorageKeys>();
  if (uniqueIds.length === 0) return allowed;

  const photos = await supabase
    .from("photos")
    .select("id, experience_id, storage_key, thumbnail_storage_key")
    .in("id", uniqueIds);
  if (photos.error || !photos.data?.length) return allowed;

  const experienceIds = [
    ...new Set(photos.data.map((row) => row.experience_id as string)),
  ];
  const experiences = await supabase
    .from("experiences")
    .select("id, owner_id")
    .in("id", experienceIds);
  if (experiences.error || !experiences.data?.length) return allowed;

  const experienceById = new Map(
    experiences.data.map((row) => [row.id as string, row]),
  );

  const ownerIds = [
    ...new Set(experiences.data.map((row) => row.owner_id as string)),
  ];
  const owners = await supabase
    .from("users")
    .select("id, profile_slug")
    .in("id", ownerIds);
  const publicOwnerIds = new Set<string>();
  for (const owner of owners.data ?? []) {
    if (owner.profile_slug) {
      publicOwnerIds.add(owner.id as string);
    }
  }

  for (const row of photos.data) {
    const experience = experienceById.get(row.experience_id as string);
    if (!experience) continue;
    const ownerId = experience.owner_id as string;
    const isOwner = Boolean(userId && ownerId === userId);
    const isPublicProfile = publicOwnerIds.has(ownerId);
    if (!isOwner && !isPublicProfile) continue;
    allowed.set(row.id as string, {
      storageKey: (row.storage_key as string | null) ?? null,
      thumbnailStorageKey: (row.thumbnail_storage_key as string | null) ?? null,
    });
  }

  return allowed;
}

export function assertR2Configured(): boolean {
  return Boolean(getR2Config());
}

export { SIGNED_TTL_SECONDS };

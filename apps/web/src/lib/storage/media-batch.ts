/**
 * Pure validation for the batched media routes (`/api/media/upload-urls`, `/api/media/confirm-batch`).
 * Same rules as the single-photo routes: object keys are always derived from the signed-in user, the experience and
 * the photo — the client never chooses where a photo is stored.
 */

import { buildPhotoObjectKey, parsePhotoObjectKey, type R2PhotoVariant } from "./r2";

/** Photos per request: keeps one request's work (and its URLs) bounded; the client splits larger sets. */
export const MAX_BATCH_PHOTOS = 40;

export interface UploadUrlItem {
  readonly photoId: string;
  readonly variant: R2PhotoVariant;
  readonly contentType: string;
}

export function parseUploadUrlItems(raw: unknown): readonly UploadUrlItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BATCH_PHOTOS * 2) return null;
  const items: UploadUrlItem[] = [];
  for (const entry of raw as readonly Record<string, unknown>[]) {
    const photoId = typeof entry?.photoId === "string" ? entry.photoId.trim() : "";
    const variant = entry?.variant;
    if (!photoId || (variant !== "original" && variant !== "thumbnail")) return null;
    const contentType =
      typeof entry.contentType === "string" && entry.contentType.trim()
        ? entry.contentType.trim()
        : "application/octet-stream";
    items.push({ photoId, variant, contentType });
  }
  return items;
}

export interface ConfirmItem {
  readonly photoId: string;
  readonly storageKey: string | null | undefined;
  readonly thumbnailStorageKey: string | null | undefined;
}

export function parseConfirmItems(raw: unknown): readonly ConfirmItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BATCH_PHOTOS) return null;
  const items: ConfirmItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw as readonly Record<string, unknown>[]) {
    const photoId = typeof entry?.photoId === "string" ? entry.photoId.trim() : "";
    if (!photoId || seen.has(photoId)) return null;
    seen.add(photoId);
    const key = (value: unknown): string | null | undefined =>
      value === null ? null : typeof value === "string" ? value : undefined;
    items.push({
      photoId,
      storageKey: key(entry.storageKey),
      thumbnailStorageKey: key(entry.thumbnailStorageKey),
    });
  }
  return items;
}

export type ConfirmPlan =
  | {
      readonly ok: true;
      /** Keys to check for existence in R2 before saving them. */
      readonly headKeys: readonly string[];
      readonly patch: { storage_key?: string | null; thumbnail_storage_key?: string | null };
    }
  | { readonly ok: false; readonly error: string };

/** What a confirmation may write: only the keys this user/experience/photo would get, nothing else. */
export function planConfirm(input: {
  readonly userId: string;
  readonly experienceId: string;
  readonly item: ConfirmItem;
}): ConfirmPlan {
  const { userId, experienceId, item } = input;
  const patch: { storage_key?: string | null; thumbnail_storage_key?: string | null } = {};
  const headKeys: string[] = [];

  for (const [field, variant, value] of [
    ["storage_key", "original", item.storageKey],
    ["thumbnail_storage_key", "thumbnail", item.thumbnailStorageKey],
  ] as const) {
    if (value === undefined) continue;
    if (value === null) {
      patch[field] = null;
      continue;
    }
    const parsed = parsePhotoObjectKey(value);
    const expected = buildPhotoObjectKey({ userId, experienceId, photoId: item.photoId, variant });
    if (
      !parsed ||
      parsed.userId !== userId ||
      parsed.experienceId !== experienceId ||
      parsed.photoId !== item.photoId ||
      parsed.variant !== variant ||
      value !== expected
    ) {
      return {
        ok: false,
        error: variant === "original" ? "storageKey inválida." : "thumbnailStorageKey inválida.",
      };
    }
    headKeys.push(value);
    patch[field] = value;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "Nada para confirmar." };
  return { ok: true, headKeys, patch };
}

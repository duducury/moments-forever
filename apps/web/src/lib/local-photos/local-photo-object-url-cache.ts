/**
 * Session cache: photo.id (+ variant) → Object URL.
 *
 * Object URLs must outlive React effect cleanups. Revoking on unmount raced with
 * async setState and Soft Navigation / router.refresh() on Admin & Perfil, leaving
 * revoked blob: URLs in the DOM while /trip remounted cleanly from IndexedDB.
 *
 * Blobs stay in IndexedDB; this only caches created Object URLs for the tab session.
 * Revoke only when the local blob is deleted.
 */

import {
  getLocalPhotoBlob,
  type LocalPhotoVariant,
} from "./photo-blob-store";

function cacheKey(photoId: string, variant: LocalPhotoVariant): string {
  return `${photoId}\0${variant}`;
}

const urls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export function peekLocalPhotoObjectUrl(
  photoId: string,
  variant: LocalPhotoVariant = "thumbnail",
): string | null {
  return urls.get(cacheKey(photoId, variant)) ?? null;
}

export async function getOrCreateLocalPhotoObjectUrl(
  photoId: string,
  variant: LocalPhotoVariant = "thumbnail",
): Promise<string | null> {
  const key = cacheKey(photoId, variant);
  const cached = urls.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const load = getLocalPhotoBlob(photoId, variant)
    .then((blob) => {
      const again = urls.get(key);
      if (again) return again;
      if (blob) {
        const url = URL.createObjectURL(blob);
        urls.set(key, url);
        return url;
      }
      // Permanent store fallback (private R2 via authorized redirect).
      const remote = `/api/media/${encodeURIComponent(photoId)}?variant=${
        variant === "thumbnail" ? "thumbnail" : "full"
      }`;
      urls.set(key, remote);
      return remote;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, load);
  return load;
}

/** Drop cached Object URLs for a photo (call when IndexedDB blob is deleted). */
export function forgetLocalPhotoObjectUrls(photoId: string): void {
  for (const variant of ["thumbnail", "full"] as const) {
    const key = cacheKey(photoId, variant);
    const url = urls.get(key);
    if (!url) continue;
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
    urls.delete(key);
  }
}

export function forgetLocalPhotoObjectUrlsMany(
  photoIds: readonly string[],
): void {
  for (const photoId of photoIds) {
    forgetLocalPhotoObjectUrls(photoId);
  }
}

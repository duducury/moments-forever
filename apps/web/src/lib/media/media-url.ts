/**
 * Stable same-origin photo URLs. Grids/lightbox can paint <img> on first render
 * (including SSR) without waiting for IndexedDB or a signed-URL round-trip.
 */

export type MediaUrlVariant = "thumbnail" | "full";

const PHOTO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** True for persisted `photos.id` values — not local-only keys like avatars. */
export function isPersistedPhotoId(photoId: string): boolean {
  return PHOTO_UUID.test(photoId);
}

export function mediaProxyUrl(
  photoId: string,
  variant: MediaUrlVariant = "full",
): string {
  return `/api/media/${encodeURIComponent(photoId)}?variant=${
    variant === "thumbnail" ? "thumbnail" : "full"
  }`;
}

/**
 * Prefer a session-cached blob URL; otherwise the media proxy for R2-backed
 * photos. Synthetic ids (profile avatars) stay local-only.
 */
export function resolvePhotoSrc(
  photoId: string | null | undefined,
  variant: MediaUrlVariant,
  cached: string | null | undefined,
): string | null {
  if (!photoId) return null;
  if (cached) return cached;
  if (isPersistedPhotoId(photoId)) return mediaProxyUrl(photoId, variant);
  return null;
}

/** True when the browser already has decoded pixels for this URL. */
export function isDecodedImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("blob:")) return true;
  if (typeof window === "undefined") return false;
  try {
    const probe = new window.Image();
    probe.src = url;
    return probe.complete && probe.naturalWidth > 0;
  } catch {
    return false;
  }
}

/**
 * Browser + CDN cache. A photo's bytes at a given id never change (edits
 * create a new id; deleting/going private just stops serving it), so the
 * browser can hold onto them for a long time — repeat visits shouldn't
 * re-download the same photo. `s-maxage` (the shared/CDN cache, which
 * affects *other* visitors) stays conservative so a profile going private
 * stops being served from a shared cache reasonably quickly; only the
 * viewer's own browser cache — lower stakes, since they already saw it —
 * gets the long lifetime. Public photos skip cookies so shared caches may
 * store them at all.
 */
export function mediaCacheControl(publicCache: boolean): string {
  if (publicCache) {
    return "public, max-age=2592000, s-maxage=86400, stale-while-revalidate=604800";
  }
  return "private, max-age=2592000, stale-while-revalidate=604800";
}

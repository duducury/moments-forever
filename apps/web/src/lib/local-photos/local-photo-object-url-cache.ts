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
  getLocalPhotoBlobRecord,
  getLocalPhotoBlobRecords,
  type LocalPhotoVariant,
} from "./photo-blob-store";

function cacheKey(photoId: string, variant: LocalPhotoVariant): string {
  return `${photoId}\0${variant}`;
}

function remoteMediaUrl(
  photoId: string,
  variant: LocalPhotoVariant,
): string {
  return `/api/media/${encodeURIComponent(photoId)}?variant=${
    variant === "thumbnail" ? "thumbnail" : "full"
  }`;
}

const urls = new Map<string, string>();
const inflightPhotos = new Map<string, Promise<void>>();

export function peekLocalPhotoObjectUrl(
  photoId: string,
  variant: LocalPhotoVariant = "thumbnail",
): string | null {
  return urls.get(cacheKey(photoId, variant)) ?? null;
}

function cacheBlobUrl(photoId: string, variant: LocalPhotoVariant, blob: Blob) {
  const key = cacheKey(photoId, variant);
  const existing = urls.get(key);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

function cacheRemoteUrls(photoId: string) {
  const thumbKey = cacheKey(photoId, "thumbnail");
  const fullKey = cacheKey(photoId, "full");
  if (!urls.has(thumbKey)) {
    urls.set(thumbKey, remoteMediaUrl(photoId, "thumbnail"));
  }
  if (!urls.has(fullKey)) {
    urls.set(fullKey, remoteMediaUrl(photoId, "full"));
  }
}

function hydrateRecord(
  photoId: string,
  record: {
    readonly blob: Blob;
    readonly thumbnail: Blob | null;
  },
) {
  cacheBlobUrl(photoId, "full", record.blob);
  if (record.thumbnail) {
    cacheBlobUrl(photoId, "thumbnail", record.thumbnail);
  } else if (!urls.has(cacheKey(photoId, "thumbnail"))) {
    // No separate thumb — reuse full so grids/lightbox still have a fast path.
    cacheBlobUrl(photoId, "thumbnail", record.blob);
  }
}

async function ensurePhotoCached(photoId: string): Promise<void> {
  const thumbReady = urls.has(cacheKey(photoId, "thumbnail"));
  const fullReady = urls.has(cacheKey(photoId, "full"));
  if (thumbReady && fullReady) return;

  const pending = inflightPhotos.get(photoId);
  if (pending) {
    await pending;
    return;
  }

  const load = (async () => {
    try {
      const record = await getLocalPhotoBlobRecord(photoId);
      if (record) {
        hydrateRecord(photoId, record);
        return;
      }
      // No local pixels — point both variants at R2 so grids get thumbs
      // and the lightbox can fetch/decode full without waiting on IDB again.
      cacheRemoteUrls(photoId);
    } catch {
      cacheRemoteUrls(photoId);
    } finally {
      inflightPhotos.delete(photoId);
    }
  })();

  inflightPhotos.set(photoId, load);
  await load;
}

export async function getOrCreateLocalPhotoObjectUrl(
  photoId: string,
  variant: LocalPhotoVariant = "thumbnail",
): Promise<string | null> {
  const cached = urls.get(cacheKey(photoId, variant));
  if (cached) return cached;

  await ensurePhotoCached(photoId);
  return urls.get(cacheKey(photoId, variant)) ?? null;
}

/** Warm many photos in one IndexedDB round-trip (lightbox neighbors). */
export async function warmLocalPhotoObjectUrls(
  photoIds: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(photoIds.filter(Boolean))];
  const missing = uniqueIds.filter(
    (id) =>
      !urls.has(cacheKey(id, "thumbnail")) || !urls.has(cacheKey(id, "full")),
  );
  if (missing.length === 0) return;

  const records = await getLocalPhotoBlobRecords(missing);
  for (const id of missing) {
    const record = records.get(id);
    if (record) {
      hydrateRecord(id, record);
    } else {
      cacheRemoteUrls(id);
    }
  }
}

/** Decode an image URL into the browser cache (no DOM paint). */
export function preloadDecodedImage(url: string): Promise<void> {
  if (typeof window === "undefined" || !url) return Promise.resolve();
  return new Promise((resolve) => {
    const probe = new window.Image();
    const done = () => resolve();
    if (typeof probe.decode === "function") {
      probe.src = url;
      void probe.decode().then(done).catch(done);
      return;
    }
    probe.onload = done;
    probe.onerror = done;
    probe.src = url;
  });
}

/**
 * Resolve full URLs (local blob or remote) and decode them so lightbox
 * neighbors open sharp without a soft→sharp upgrade.
 */
export async function warmAndPreloadLocalPhotoFulls(
  photoIds: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(photoIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  await warmLocalPhotoObjectUrls(uniqueIds);
  await Promise.all(
    uniqueIds.map(async (id) => {
      const url =
        urls.get(cacheKey(id, "full")) ??
        (await getOrCreateLocalPhotoObjectUrl(id, "full"));
      if (url) await preloadDecodedImage(url);
    }),
  );
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
  inflightPhotos.delete(photoId);
}

export function forgetLocalPhotoObjectUrlsMany(
  photoIds: readonly string[],
): void {
  for (const photoId of photoIds) {
    forgetLocalPhotoObjectUrls(photoId);
  }
}

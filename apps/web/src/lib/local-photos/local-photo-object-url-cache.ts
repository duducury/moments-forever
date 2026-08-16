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

const preloadedFullIds = new Set<string>();
const preloadInflight = new Map<string, Promise<void>>();

type PrefetchQueued = {
  readonly photoId: string;
  readonly score: number;
};

let prefetchQueue: PrefetchQueued[] = [];
let prefetchActive = 0;
const PREFETCH_CONCURRENCY = 2;

async function preloadFullForPhoto(photoId: string): Promise<void> {
  if (preloadedFullIds.has(photoId)) return;
  const existing = preloadInflight.get(photoId);
  if (existing) {
    await existing;
    return;
  }

  const work = (async () => {
    await warmLocalPhotoObjectUrls([photoId]);
    const url =
      urls.get(cacheKey(photoId, "full")) ??
      (await getOrCreateLocalPhotoObjectUrl(photoId, "full"));
    if (url) await preloadDecodedImage(url);
    preloadedFullIds.add(photoId);
  })().finally(() => {
    preloadInflight.delete(photoId);
  });

  preloadInflight.set(photoId, work);
  await work;
}

function pumpFullPrefetchQueue(): void {
  while (prefetchActive < PREFETCH_CONCURRENCY && prefetchQueue.length > 0) {
    const next = prefetchQueue.shift();
    if (!next) break;
    if (
      preloadedFullIds.has(next.photoId) ||
      preloadInflight.has(next.photoId)
    ) {
      continue;
    }
    prefetchActive += 1;
    void preloadFullForPhoto(next.photoId).finally(() => {
      prefetchActive -= 1;
      pumpFullPrefetchQueue();
    });
  }
}

function enqueueFullPrefetch(photoId: string, score: number): void {
  if (!photoId) return;
  if (preloadedFullIds.has(photoId) || preloadInflight.has(photoId)) return;
  const existing = prefetchQueue.findIndex((item) => item.photoId === photoId);
  if (existing >= 0) {
    if (prefetchQueue[existing]!.score >= score) return;
    prefetchQueue.splice(existing, 1);
  }
  prefetchQueue.push({ photoId, score });
  prefetchQueue.sort((a, b) => b.score - a.score);
}

/**
 * Prioritize full-image prefetch for the album folder the user is in.
 * When `focusIndex` is set (lightbox open), current ± neighbors jump the queue
 * so swiping the next photo is already warm.
 */
export function prioritizeAlbumFullPrefetch(
  photoIds: readonly string[],
  focusIndex: number | null = null,
): void {
  const uniqueIds = [...new Set(photoIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  // Drop ids that are no longer in this folder from the pending queue.
  const allowed = new Set(uniqueIds);
  prefetchQueue = prefetchQueue.filter((item) => allowed.has(item.photoId));

  if (focusIndex != null && focusIndex >= 0 && focusIndex < uniqueIds.length) {
    const ordered: { id: string; score: number }[] = [];
    const push = (offset: number, score: number) => {
      const id =
        uniqueIds[
          (focusIndex + offset + uniqueIds.length) % uniqueIds.length
        ];
      if (id) ordered.push({ id, score });
    };
    // Current first, then next (swipe direction), then prev, then +2/-2…
    push(0, 10_000);
    push(1, 9_500);
    push(-1, 9_400);
    push(2, 9_000);
    push(-2, 8_900);
    push(3, 8_500);
    push(-3, 8_400);

    const seen = new Set<string>();
    for (const item of ordered) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      enqueueFullPrefetch(item.id, item.score);
    }
    uniqueIds.forEach((id, index) => {
      if (seen.has(id)) return;
      const distance = Math.min(
        Math.abs(index - focusIndex),
        uniqueIds.length - Math.abs(index - focusIndex),
      );
      enqueueFullPrefetch(id, 1_000 - distance);
    });
  } else {
    // Browsing the folder: cover/first photos first, then the rest.
    uniqueIds.forEach((id, index) => {
      enqueueFullPrefetch(id, 500 - index);
    });
  }

  pumpFullPrefetchQueue();
}

/** Mark a full as already warm (e.g. after the lightbox img loads). */
export function markLocalPhotoFullPreloaded(photoId: string): void {
  if (!photoId) return;
  preloadedFullIds.add(photoId);
  prefetchQueue = prefetchQueue.filter((item) => item.photoId !== photoId);
}

/** Stop pending folder prefetches (e.g. leaving the album). */
export function clearAlbumFullPrefetch(): void {
  prefetchQueue = [];
}

/**
 * Resolve full URLs and decode them (legacy helper; prefer prioritizeAlbumFullPrefetch).
 */
export async function warmAndPreloadLocalPhotoFulls(
  photoIds: readonly string[],
): Promise<void> {
  prioritizeAlbumFullPrefetch(photoIds, 0);
  await Promise.all(
    [...new Set(photoIds.filter(Boolean))].map((id) =>
      preloadFullForPhoto(id),
    ),
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

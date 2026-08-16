/**
 * Session cache: photo.id (+ variant) → Object URL or media proxy URL.
 *
 * Object URLs must outlive React effect cleanups. Revoking on unmount raced with
 * async setState and Soft Navigation / router.refresh() on Admin & Perfil, leaving
 * revoked blob: URLs in the DOM while /trip remounted cleanly from IndexedDB.
 *
 * Blobs stay in IndexedDB; this only caches created Object URLs for the tab session.
 * Remote photos use `/api/media/…` immediately (browser follows the R2 redirect).
 * We never block first paint on batch signed-URL resolution — that made lightbox
 * wait on the whole album and look “stuck”.
 */

import {
  getLocalPhotoBlobRecord,
  getLocalPhotoBlobRecords,
  type LocalPhotoVariant,
} from "./photo-blob-store";

function cacheKey(photoId: string, variant: LocalPhotoVariant): string {
  return `${photoId}\0${variant}`;
}

function remoteMediaProxyUrl(
  photoId: string,
  variant: LocalPhotoVariant,
): string {
  return `/api/media/${encodeURIComponent(photoId)}?variant=${
    variant === "thumbnail" ? "thumbnail" : "full"
  }`;
}

function isBlobUrl(url: string | undefined | null): boolean {
  return Boolean(url?.startsWith("blob:"));
}

const urls = new Map<string, string>();
const inflightPhotos = new Map<string, Promise<void>>();
const urlListeners = new Set<() => void>();

function notifyUrlListeners(): void {
  for (const listener of urlListeners) {
    listener();
  }
}

export function subscribeLocalPhotoUrlCache(listener: () => void): () => void {
  urlListeners.add(listener);
  return () => {
    urlListeners.delete(listener);
  };
}

export function peekLocalPhotoObjectUrl(
  photoId: string,
  variant: LocalPhotoVariant = "thumbnail",
): string | null {
  return urls.get(cacheKey(photoId, variant)) ?? null;
}

function cacheBlobUrl(photoId: string, variant: LocalPhotoVariant, blob: Blob) {
  const key = cacheKey(photoId, variant);
  const existing = urls.get(key);
  if (existing && isBlobUrl(existing)) return existing;
  if (existing?.startsWith("blob:")) {
    URL.revokeObjectURL(existing);
  }
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

function cacheRemoteProxyUrls(photoId: string) {
  const thumbKey = cacheKey(photoId, "thumbnail");
  const fullKey = cacheKey(photoId, "full");
  let changed = false;
  if (!urls.has(thumbKey)) {
    urls.set(thumbKey, remoteMediaProxyUrl(photoId, "thumbnail"));
    changed = true;
  }
  if (!urls.has(fullKey)) {
    urls.set(fullKey, remoteMediaProxyUrl(photoId, "full"));
    changed = true;
  }
  return changed;
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
      // Check IndexedDB first. Setting a remote proxy before that races with
      // local blobs and restarts the lightbox download (felt much slower).
      const record = await getLocalPhotoBlobRecord(photoId);
      if (record) {
        hydrateRecord(photoId, record);
        notifyUrlListeners();
        return;
      }
      if (cacheRemoteProxyUrls(photoId)) {
        notifyUrlListeners();
      }
    } catch {
      if (cacheRemoteProxyUrls(photoId)) {
        notifyUrlListeners();
      }
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

/** Warm many photos in one IndexedDB round-trip; remotes get proxy URLs instantly. */
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
  let changed = false;
  for (const id of missing) {
    const record = records.get(id);
    if (record) {
      hydrateRecord(id, record);
      changed = true;
    } else if (cacheRemoteProxyUrls(id)) {
      changed = true;
    }
  }
  if (changed) notifyUrlListeners();
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
/** Keep low so the open photo wins the network. */
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
 * Prefetch full bytes only for a tight window around the open photo.
 * Never download the whole album at once — that starved the photo being viewed.
 */
export function prioritizeAlbumFullPrefetch(
  photoIds: readonly string[],
  focusIndex: number | null = null,
): void {
  const uniqueIds = [...new Set(photoIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const focus =
    focusIndex != null && focusIndex >= 0 && focusIndex < uniqueIds.length
      ? focusIndex
      : 0;

  // Resolve local/proxy URLs for the window only (cheap).
  const windowIds: string[] = [];
  for (const offset of [0, 1, -1, 2, -2, 3, -3]) {
    const id =
      uniqueIds[(focus + offset + uniqueIds.length) % uniqueIds.length];
    if (id && !windowIds.includes(id)) windowIds.push(id);
  }
  void warmLocalPhotoObjectUrls(windowIds);

  prefetchQueue = prefetchQueue.filter((item) => windowIds.includes(item.photoId));

  windowIds.forEach((id, order) => {
    enqueueFullPrefetch(id, 10_000 - order * 100);
  });
  pumpFullPrefetchQueue();
}

/** Start full prefetch as soon as the user intends to open a photo. */
export function prefetchLocalPhotoFullOnIntent(photoId: string): void {
  if (!photoId) return;
  // Jump the queue ahead of neighbors.
  enqueueFullPrefetch(photoId, 50_000);
  void warmLocalPhotoObjectUrls([photoId]);
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
  preloadedFullIds.delete(photoId);
}

export function forgetLocalPhotoObjectUrlsMany(
  photoIds: readonly string[],
): void {
  for (const photoId of photoIds) {
    forgetLocalPhotoObjectUrls(photoId);
  }
}

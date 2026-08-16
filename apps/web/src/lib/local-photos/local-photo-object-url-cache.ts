/**
 * Session cache: photo.id (+ variant) → Object URL or direct R2 signed URL.
 *
 * Object URLs must outlive React effect cleanups. Revoking on unmount raced with
 * async setState and Soft Navigation / router.refresh() on Admin & Perfil, leaving
 * revoked blob: URLs in the DOM while /trip remounted cleanly from IndexedDB.
 *
 * Blobs stay in IndexedDB; this only caches created Object URLs for the tab session.
 * Remote photos resolve short-lived R2 signed URLs once (batch) so <img> skips the
 * /api/media auth+302 hop on every paint.
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

function isApiProxyUrl(url: string | undefined | null): boolean {
  return Boolean(url?.startsWith("/api/media/"));
}

function isBlobUrl(url: string | undefined | null): boolean {
  return Boolean(url?.startsWith("blob:"));
}

const urls = new Map<string, string>();
const inflightPhotos = new Map<string, Promise<void>>();
const signedResolveInflight = new Map<string, Promise<void>>();
const urlListeners = new Set<() => void>();

/** Client memo of batch-resolved signed URLs (refresh ~5 min before expiry). */
const signedExpiryByPhoto = new Map<string, number>();
const SIGNED_CLIENT_SKEW_MS = 60 * 5 * 1000;

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

function cacheRemoteProxyFallback(photoId: string) {
  const thumbKey = cacheKey(photoId, "thumbnail");
  const fullKey = cacheKey(photoId, "full");
  if (!urls.has(thumbKey) || isApiProxyUrl(urls.get(thumbKey))) {
    urls.set(thumbKey, remoteMediaProxyUrl(photoId, "thumbnail"));
  }
  if (!urls.has(fullKey) || isApiProxyUrl(urls.get(fullKey))) {
    urls.set(fullKey, remoteMediaProxyUrl(photoId, "full"));
  }
}

function setSignedRemoteUrl(
  photoId: string,
  variant: LocalPhotoVariant,
  signedUrl: string,
) {
  const key = cacheKey(photoId, variant);
  const existing = urls.get(key);
  if (existing && isBlobUrl(existing)) return;
  if (existing === signedUrl) return;
  urls.set(key, signedUrl);
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

function needsRemoteSignedResolution(photoId: string): boolean {
  const thumb = urls.get(cacheKey(photoId, "thumbnail"));
  const full = urls.get(cacheKey(photoId, "full"));
  if (isBlobUrl(thumb) && isBlobUrl(full)) return false;
  const expiresAt = signedExpiryByPhoto.get(photoId) ?? 0;
  if (
    expiresAt - SIGNED_CLIENT_SKEW_MS > Date.now() &&
    full &&
    !isApiProxyUrl(full) &&
    thumb &&
    !isApiProxyUrl(thumb)
  ) {
    return false;
  }
  return true;
}

async function resolveRemoteSignedUrls(
  photoIds: readonly string[],
): Promise<void> {
  const uniqueIds = [
    ...new Set(photoIds.filter((id) => id && needsRemoteSignedResolution(id))),
  ];
  if (uniqueIds.length === 0 || typeof window === "undefined") return;

  const alreadyWaiting = uniqueIds
    .map((id) => signedResolveInflight.get(id))
    .filter((value): value is Promise<void> => Boolean(value));
  const toFetch = uniqueIds.filter((id) => !signedResolveInflight.has(id));

  if (toFetch.length === 0) {
    await Promise.all(alreadyWaiting);
    return;
  }

  const work = (async () => {
    try {
      const response = await fetch("/api/media/signed-urls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          photoIds: toFetch,
          variants: ["full", "thumbnail"],
        }),
      });
      if (!response.ok) {
        for (const id of toFetch) {
          cacheRemoteProxyFallback(id);
        }
        notifyUrlListeners();
        return;
      }
      const payload = (await response.json()) as {
        readonly urls?: Record<
          string,
          { readonly full?: string; readonly thumbnail?: string }
        >;
        readonly expiresAt?: number;
      };
      const expiresAt =
        typeof payload.expiresAt === "number"
          ? payload.expiresAt
          : Date.now() + 60 * 25 * 1000;
      let changed = false;
      for (const id of toFetch) {
        const entry = payload.urls?.[id];
        if (!entry?.full && !entry?.thumbnail) {
          cacheRemoteProxyFallback(id);
          changed = true;
          continue;
        }
        if (entry.full) {
          setSignedRemoteUrl(id, "full", entry.full);
          changed = true;
        }
        if (entry.thumbnail) {
          setSignedRemoteUrl(id, "thumbnail", entry.thumbnail);
          changed = true;
        } else if (entry.full) {
          setSignedRemoteUrl(id, "thumbnail", entry.full);
          changed = true;
        }
        signedExpiryByPhoto.set(id, expiresAt);
      }
      if (changed) notifyUrlListeners();
    } catch {
      for (const id of toFetch) {
        cacheRemoteProxyFallback(id);
      }
      notifyUrlListeners();
    }
  })().finally(() => {
    for (const id of toFetch) {
      signedResolveInflight.delete(id);
    }
  });

  for (const id of toFetch) {
    signedResolveInflight.set(id, work);
  }

  await Promise.all([work, ...alreadyWaiting]);
}

async function ensurePhotoCached(photoId: string): Promise<void> {
  const thumb = urls.get(cacheKey(photoId, "thumbnail"));
  const full = urls.get(cacheKey(photoId, "full"));
  if (
    thumb &&
    full &&
    !isApiProxyUrl(thumb) &&
    !isApiProxyUrl(full) &&
    !needsRemoteSignedResolution(photoId)
  ) {
    return;
  }

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
        notifyUrlListeners();
        return;
      }
      await resolveRemoteSignedUrls([photoId]);
      if (
        !urls.has(cacheKey(photoId, "full")) ||
        !urls.has(cacheKey(photoId, "thumbnail"))
      ) {
        cacheRemoteProxyFallback(photoId);
        notifyUrlListeners();
      }
    } catch {
      cacheRemoteProxyFallback(photoId);
      notifyUrlListeners();
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
  if (cached && !isApiProxyUrl(cached) && !needsRemoteSignedResolution(photoId)) {
    return cached;
  }

  await ensurePhotoCached(photoId);
  return urls.get(cacheKey(photoId, variant)) ?? null;
}

/** Warm many photos: local blobs first, then one signed-URL batch for remotes. */
export async function warmLocalPhotoObjectUrls(
  photoIds: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(photoIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const missingLocal = uniqueIds.filter((id) => {
    const thumb = urls.get(cacheKey(id, "thumbnail"));
    const full = urls.get(cacheKey(id, "full"));
    return !(isBlobUrl(thumb) && isBlobUrl(full));
  });
  if (missingLocal.length === 0) return;

  const records = await getLocalPhotoBlobRecords(missingLocal);
  const needSigned: string[] = [];
  for (const id of missingLocal) {
    const record = records.get(id);
    if (record) {
      hydrateRecord(id, record);
    } else {
      needSigned.push(id);
    }
  }
  if (needSigned.length > 0) {
    // Chunk to API max (48).
    for (let offset = 0; offset < needSigned.length; offset += 48) {
      await resolveRemoteSignedUrls(needSigned.slice(offset, offset + 48));
    }
  }
  notifyUrlListeners();
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
const PREFETCH_CONCURRENCY = 3;

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

  // Resolve signed URLs for the folder in the background (cheap vs image bytes).
  void warmLocalPhotoObjectUrls(uniqueIds);

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
    uniqueIds.forEach((id, index) => {
      enqueueFullPrefetch(id, 500 - index);
    });
  }

  pumpFullPrefetchQueue();
}

/** Start full prefetch as soon as the user intends to open a photo. */
export function prefetchLocalPhotoFullOnIntent(photoId: string): void {
  if (!photoId) return;
  enqueueFullPrefetch(photoId, 20_000);
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
  signedExpiryByPhoto.delete(photoId);
  preloadedFullIds.delete(photoId);
}

export function forgetLocalPhotoObjectUrlsMany(
  photoIds: readonly string[],
): void {
  for (const photoId of photoIds) {
    forgetLocalPhotoObjectUrls(photoId);
  }
}

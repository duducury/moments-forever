"use client";

/**
 * Uploads local photo blobs to private R2 via short-lived presigned PUT URLs.
 * Secrets never touch the browser — only the signed URL from our API.
 *
 * MVP: `full` is the display preview (~1600px JPEG), stored under the R2 key
 * variant `original` for backward-compatible object paths. Camera originals
 * are not uploaded. See docs/photo-storage.md.
 */

import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";

export async function uploadPhotoBlobsToR2(input: {
  readonly photoId: string;
  readonly experienceId: string;
  /** MVP preview derivative (not the camera original). */
  readonly full: Blob;
  readonly thumbnail: Blob | null;
}): Promise<void> {
  // The preview and the thumbnail are independent: send both at the same time.
  const sendVariant = async (
    variant: "original" | "thumbnail",
    blob: Blob,
  ): Promise<string> => {
    const contentType = blob.type || "image/jpeg";
    const target = await requestUploadUrl({
      photoId: input.photoId,
      experienceId: input.experienceId,
      variant,
      contentType,
    });
    await putToSignedUrl(target.uploadUrl, blob, contentType);
    return target.key;
  };

  const [originalKey, thumbnailKey] = await Promise.all([
    sendVariant("original", input.full),
    input.thumbnail && input.thumbnail.size > 0
      ? sendVariant("thumbnail", input.thumbnail)
      : Promise.resolve<string | null>(null),
  ]);

  const confirm = await fetch("/api/media/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      photoId: input.photoId,
      experienceId: input.experienceId,
      storageKey: originalKey,
      thumbnailStorageKey: thumbnailKey,
    }),
  });
  const payload = (await confirm.json()) as { readonly error?: string };
  if (!confirm.ok) {
    throw new Error(payload.error ?? "Falha ao confirmar armazenamento.");
  }
}

async function requestUploadUrl(input: {
  readonly photoId: string;
  readonly experienceId: string;
  readonly variant: "original" | "thumbnail";
  readonly contentType: string;
}): Promise<{ readonly uploadUrl: string; readonly key: string }> {
  const response = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as {
    readonly uploadUrl?: string;
    readonly key?: string;
    readonly error?: string;
  };
  if (!response.ok || !payload.uploadUrl || !payload.key) {
    throw new Error(payload.error ?? "Não foi possível preparar o upload.");
  }
  return { uploadUrl: payload.uploadUrl, key: payload.key };
}

/**
 * The browser PUTs straight to R2, so a network drop and a CORS refusal look the
 * same from here. The app's own origin is named because it is what the bucket's
 * CORS rule has to allow (production, or a Vercel preview used for testing).
 */
export function storageUnreachableMessage(origin: string | null): string {
  const named = origin ? ` Origem deste app: ${origin}.` : "";
  return `Não foi possível enviar ao armazenamento (rede ou CORS do R2).${named} No Cloudflare R2 → Settings → CORS, permita PUT dessa origem (docs/photo-storage.md).`;
}

async function putToSignedUrl(
  uploadUrl: string,
  body: Blob,
  contentType: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": contentType },
      body,
    });
  } catch {
    throw new Error(
      storageUnreachableMessage(
        typeof window !== "undefined" ? window.location.origin : null,
      ),
    );
  }
  if (!response.ok) {
    throw new Error(
      `Falha ao enviar a foto ao armazenamento permanente (${response.status}).`,
    );
  }
}

export interface PhotoUploadItem {
  readonly id: string;
  readonly full: Blob;
  readonly thumbnail: Blob | null;
}

export interface PhotoUploadOutcome {
  /** Photos whose files are in the cloud AND confirmed on their row. */
  readonly uploaded: readonly string[];
  /** Photos that are not (yet) in the cloud, with why. Everything else was still attempted. */
  readonly failed: readonly { readonly id: string; readonly error: string }[];
}

/** Photos sending at once (each sends its preview and thumbnail together): enough to fill the link, not to flood it. */
const PHOTO_PUT_CONCURRENCY = 3;
/** Same-origin batch requests carry at most this many photos (the server enforces it too). */
const BATCH_SIZE = 40;
/** A dropped connection is common on a phone: each file gets one more try before the photo counts as failed. */
const PUT_ATTEMPTS = 2;
const PUT_RETRY_DELAY_MS = 400;

type BatchUrl = {
  readonly photoId: string;
  readonly variant: "original" | "thumbnail";
  readonly uploadUrl?: string;
  readonly key?: string;
  readonly error?: string;
};

class BatchRouteMissingError extends Error {}

async function postJson<T>(url: string, body: unknown): Promise<{ readonly ok: boolean; readonly status: number; readonly data: T }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {} as T;
  try {
    data = (await response.json()) as T;
  } catch {
    // Non-JSON error body: the status says enough.
  }
  return { ok: response.ok, status: response.status, data };
}

async function putWithRetry(url: string, blob: Blob, contentType: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PUT_ATTEMPTS; attempt += 1) {
    try {
      await putToSignedUrl(url, blob, contentType);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < PUT_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, PUT_RETRY_DELAY_MS));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha ao enviar a foto.");
}

/**
 * Sends photos to R2 and confirms them, with the work shared across the whole set:
 *   1. one request returns every presigned URL (instead of two per photo),
 *   2. the files go up with a bounded number of photos at a time, each file retried once,
 *   3. one request confirms every photo that went up (instead of one each).
 * A photo that fails never stops the others, and never creates anything twice: the object keys are fixed per
 * photo, so sending the same photo again just replaces the same file. Falls back to the one-photo-at-a-time routes
 * when the batch routes are not available (an older deployment).
 */
export async function uploadPhotoBatchToR2(
  experienceId: string,
  items: readonly PhotoUploadItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<PhotoUploadOutcome> {
  const uploaded: string[] = [];
  const failed: { id: string; error: string }[] = [];
  let progress = 0;
  const tick = () => {
    progress += 1;
    onProgress?.(progress, items.length);
  };

  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const chunk = items.slice(start, start + BATCH_SIZE);
    try {
      const outcome = await uploadChunk(experienceId, chunk, tick);
      uploaded.push(...outcome.uploaded);
      failed.push(...outcome.failed);
    } catch (error) {
      if (!(error instanceof BatchRouteMissingError)) throw error;
      const outcome = await uploadChunkOneByOne(experienceId, chunk, tick);
      uploaded.push(...outcome.uploaded);
      failed.push(...outcome.failed);
    }
  }
  return { uploaded, failed };
}

async function uploadChunk(
  experienceId: string,
  chunk: readonly PhotoUploadItem[],
  tick: () => void,
): Promise<PhotoUploadOutcome> {
  const variants = chunk.flatMap((item) => [
    { photoId: item.id, variant: "original" as const, blob: item.full },
    ...(item.thumbnail && item.thumbnail.size > 0
      ? [{ photoId: item.id, variant: "thumbnail" as const, blob: item.thumbnail }]
      : []),
  ]);

  const urls = await postJson<{ readonly items?: readonly BatchUrl[]; readonly error?: string }>(
    "/api/media/upload-urls",
    {
      experienceId,
      items: variants.map((entry) => ({
        photoId: entry.photoId,
        variant: entry.variant,
        contentType: entry.blob.type || "image/jpeg",
      })),
    },
  );
  if (urls.status === 404 || urls.status === 405) {
    // 404 also means "experience not found" on the real route; the one-by-one path then reports it per photo.
    if (!urls.data.error) throw new BatchRouteMissingError();
  }
  if (!urls.ok || !urls.data.items) {
    const message = urls.data.error ?? "Não foi possível preparar o upload.";
    return { uploaded: [], failed: chunk.map((item) => ({ id: item.id, error: message })) };
  }
  const urlOf = new Map(urls.data.items.map((entry) => [`${entry.photoId}:${entry.variant}`, entry]));

  const keys = new Map<string, { original: string | null; thumbnail: string | null }>();
  const putOk: PhotoUploadItem[] = [];
  const failed: { id: string; error: string }[] = [];

  await mapWithConcurrency(chunk, PHOTO_PUT_CONCURRENCY, async (item) => {
    const mine = variants.filter((entry) => entry.photoId === item.id);
    try {
      const sent = await Promise.all(
        mine.map(async (entry) => {
          const target = urlOf.get(`${entry.photoId}:${entry.variant}`);
          if (!target?.uploadUrl || !target.key) {
            throw new Error(target?.error ?? "Não foi possível preparar o upload.");
          }
          await putWithRetry(target.uploadUrl, entry.blob, entry.blob.type || "image/jpeg");
          return { variant: entry.variant, key: target.key };
        }),
      );
      keys.set(item.id, {
        original: sent.find((entry) => entry.variant === "original")?.key ?? null,
        thumbnail: sent.find((entry) => entry.variant === "thumbnail")?.key ?? null,
      });
      putOk.push(item);
    } catch (error) {
      failed.push({ id: item.id, error: error instanceof Error ? error.message : "Falha ao enviar a foto." });
    }
    tick();
  });

  if (putOk.length === 0) return { uploaded: [], failed };

  const confirmBody = {
    experienceId,
    items: putOk.map((item) => ({
      photoId: item.id,
      storageKey: keys.get(item.id)?.original ?? null,
      thumbnailStorageKey: keys.get(item.id)?.thumbnail ?? null,
    })),
  };
  let confirmed: Awaited<ReturnType<typeof postJson<{ readonly results?: readonly { readonly photoId: string; readonly ok: boolean; readonly error?: string }[]; readonly error?: string }>>> | null = null;
  for (let attempt = 1; attempt <= 2 && !confirmed?.ok; attempt += 1) {
    try {
      confirmed = await postJson("/api/media/confirm-batch", confirmBody);
    } catch {
      confirmed = null;
    }
  }
  if (confirmed?.status === 404 && !confirmed.data.error) throw new BatchRouteMissingError();
  const resultOf = new Map((confirmed?.ok ? (confirmed.data.results ?? []) : []).map((entry) => [entry.photoId, entry]));
  const uploaded: string[] = [];
  for (const item of putOk) {
    const result = resultOf.get(item.id);
    if (result?.ok) {
      uploaded.push(item.id);
    } else {
      failed.push({
        id: item.id,
        error: result?.error ?? confirmed?.data.error ?? "Falha ao confirmar armazenamento.",
      });
    }
  }
  return { uploaded, failed };
}

/** The original per-photo path, still used when the batch routes are missing. Failures are isolated per photo. */
async function uploadChunkOneByOne(
  experienceId: string,
  chunk: readonly PhotoUploadItem[],
  tick: () => void,
): Promise<PhotoUploadOutcome> {
  const uploaded: string[] = [];
  const failed: { id: string; error: string }[] = [];
  await mapWithConcurrency(chunk, PHOTO_PUT_CONCURRENCY, async (item) => {
    try {
      await uploadPhotoBlobsToR2({
        photoId: item.id,
        experienceId,
        full: item.full,
        thumbnail: item.thumbnail,
      });
      uploaded.push(item.id);
    } catch (error) {
      failed.push({ id: item.id, error: error instanceof Error ? error.message : "Falha ao enviar a foto." });
    }
    tick();
  });
  return { uploaded, failed };
}

/**
 * Compatibility wrapper for callers that only want "it worked or it threw": every photo is still attempted, then it
 * throws (with the first reason) if any did not make it.
 */
export async function uploadManyPhotoBlobsToR2(
  experienceId: string,
  items: readonly PhotoUploadItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const outcome = await uploadPhotoBatchToR2(experienceId, items, onProgress);
  if (outcome.failed.length > 0) {
    const first = outcome.failed[0]?.error ?? "Falha ao enviar ao armazenamento permanente.";
    throw new Error(
      outcome.failed.length === items.length ? first : `${outcome.failed.length} de ${items.length} fotos não foram enviadas. ${first}`,
    );
  }
}

export type SyncLocalPhotosToR2Result = {
  readonly uploaded: number;
  readonly skipped: number;
  readonly failed: number;
  readonly lastError: string | null;
};

/**
 * Re-uploads photos that still exist in IndexedDB but lack permanent R2 keys.
 * Safe to call on album open for the owner — no-ops when local blobs are gone.
 */
export async function syncLocalPhotosToR2(
  experienceId: string,
  photoIds: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<SyncLocalPhotosToR2Result> {
  const { getLocalPhotoBlobRecord } = await import(
    "@/lib/local-photos/photo-blob-store"
  );
  const { forgetLocalPhotoObjectUrls } = await import(
    "@/lib/local-photos/local-photo-object-url-cache"
  );

  const uniqueIds = [...new Set(photoIds.filter(Boolean))];
  let skipped = 0;

  // Load what is still on this device (a few at a time), then send them all as one batch.
  const loaded = await mapWithConcurrency(uniqueIds, 4, async (photoId) => {
    const record = await getLocalPhotoBlobRecord(photoId).catch(() => null);
    return record?.blob ? { id: photoId, full: record.blob, thumbnail: record.thumbnail } : null;
  });
  const items: PhotoUploadItem[] = [];
  for (const entry of loaded) {
    if (entry) items.push(entry);
    else skipped += 1;
  }
  onProgress?.(skipped, uniqueIds.length);

  let outcome: PhotoUploadOutcome;
  try {
    outcome = await uploadPhotoBatchToR2(experienceId, items, (done) => onProgress?.(skipped + done, uniqueIds.length));
  } catch (error) {
    return {
      uploaded: 0,
      skipped,
      failed: items.length,
      lastError: error instanceof Error ? error.message : "Falha ao reenviar foto ao armazenamento.",
    };
  }
  for (const id of outcome.uploaded) forgetLocalPhotoObjectUrls(id);

  return {
    uploaded: outcome.uploaded.length,
    skipped,
    failed: outcome.failed.length,
    lastError: outcome.failed.length > 0 ? (outcome.failed[outcome.failed.length - 1]?.error ?? null) : null,
  };
}

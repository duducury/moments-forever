"use client";

/**
 * Uploads local photo blobs to private R2 via short-lived presigned PUT URLs.
 * Secrets never touch the browser — only the signed URL from our API.
 *
 * MVP: `full` is the display preview (~2048px JPEG), stored under the R2 key
 * variant `original` for backward-compatible object paths. Camera originals
 * are not uploaded. See docs/photo-storage.md.
 */

export async function uploadPhotoBlobsToR2(input: {
  readonly photoId: string;
  readonly experienceId: string;
  /** MVP preview derivative (not the camera original). */
  readonly full: Blob;
  readonly thumbnail: Blob | null;
}): Promise<void> {
  const originalType = input.full.type || "image/jpeg";
  const original = await requestUploadUrl({
    photoId: input.photoId,
    experienceId: input.experienceId,
    variant: "original",
    contentType: originalType,
  });
  await putToSignedUrl(original.uploadUrl, input.full, originalType);

  let thumbnailKey: string | null = null;
  if (input.thumbnail && input.thumbnail.size > 0) {
    const thumbType = input.thumbnail.type || "image/jpeg";
    const thumb = await requestUploadUrl({
      photoId: input.photoId,
      experienceId: input.experienceId,
      variant: "thumbnail",
      contentType: thumbType,
    });
    await putToSignedUrl(thumb.uploadUrl, input.thumbnail, thumbType);
    thumbnailKey = thumb.key;
  }

  const confirm = await fetch("/api/media/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      photoId: input.photoId,
      experienceId: input.experienceId,
      storageKey: original.key,
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
      "Não foi possível enviar ao armazenamento (rede ou CORS do R2). No Cloudflare R2 → Settings → CORS, permita PUT do domínio da app (ex.: https://moments-forever-web.vercel.app).",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Falha ao enviar a foto ao armazenamento permanente (${response.status}).`,
    );
  }
}

export async function uploadManyPhotoBlobsToR2(
  experienceId: string,
  items: readonly {
    readonly id: string;
    readonly full: Blob;
    readonly thumbnail: Blob | null;
  }[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let done = 0;
  for (const item of items) {
    await uploadPhotoBlobsToR2({
      photoId: item.id,
      experienceId,
      full: item.full,
      thumbnail: item.thumbnail,
    });
    done += 1;
    onProgress?.(done, items.length);
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

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let lastError: string | null = null;
  const uniqueIds = [...new Set(photoIds.filter(Boolean))];

  for (const [index, photoId] of uniqueIds.entries()) {
    try {
      const record = await getLocalPhotoBlobRecord(photoId);
      if (!record?.blob) {
        skipped += 1;
        onProgress?.(index + 1, uniqueIds.length);
        continue;
      }
      await uploadPhotoBlobsToR2({
        photoId,
        experienceId,
        full: record.blob,
        thumbnail: record.thumbnail,
      });
      forgetLocalPhotoObjectUrls(photoId);
      uploaded += 1;
    } catch (error) {
      failed += 1;
      lastError =
        error instanceof Error
          ? error.message
          : "Falha ao reenviar foto ao armazenamento.";
    }
    onProgress?.(index + 1, uniqueIds.length);
  }

  return { uploaded, skipped, failed, lastError };
}

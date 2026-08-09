"use client";

/**
 * Uploads local photo blobs to private R2 via short-lived presigned PUT URLs.
 * Secrets never touch the browser — only the signed URL from our API.
 */

export async function uploadPhotoBlobsToR2(input: {
  readonly photoId: string;
  readonly experienceId: string;
  readonly full: Blob;
  readonly thumbnail: Blob | null;
}): Promise<void> {
  const originalType = input.full.type || "application/octet-stream";
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
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body,
  });
  if (!response.ok) {
    throw new Error("Falha ao enviar a foto para o armazenamento permanente.");
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

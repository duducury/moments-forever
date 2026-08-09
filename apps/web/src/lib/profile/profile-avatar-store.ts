/**
 * Profile avatar pixels stay local (IndexedDB), like trip photos.
 * Keyed by owner id — not a row in public.photos.
 */

import { createBrowserThumbnail } from "@/lib/photo-import/browser-metadata";
import {
  deleteLocalPhotoBlob,
  putLocalPhotoBlob,
} from "@/lib/local-photos/photo-blob-store";

export function profileAvatarBlobId(ownerId: string): string {
  return `profile-avatar:${ownerId}`;
}

export async function saveProfileAvatarFromFile(
  ownerId: string,
  file: File,
): Promise<void> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Escolha um arquivo de imagem.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("A imagem deve ter no máximo 12 MB.");
  }

  const id = profileAvatarBlobId(ownerId);
  const [full, thumb] = await Promise.all([
    createBrowserThumbnail(file, 960, 0.9),
    createBrowserThumbnail(file, 320, 0.82),
  ]);

  await putLocalPhotoBlob(
    id,
    full?.blob ?? file,
    thumb?.blob ?? full?.blob ?? null,
  );

  const { forgetLocalPhotoObjectUrls } = await import(
    "@/lib/local-photos/local-photo-object-url-cache"
  );
  forgetLocalPhotoObjectUrls(id);
}

export async function clearProfileAvatar(ownerId: string): Promise<void> {
  await deleteLocalPhotoBlob(profileAvatarBlobId(ownerId));
}

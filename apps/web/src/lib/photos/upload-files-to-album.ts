import { mapLocalDateSourceToDb } from "@moments-forever/shared";

import { putLocalPhotoBlobs } from "@/lib/local-photos/photo-blob-store";
import {
  createBrowserPhotoDerivatives,
  extractBrowserPhotoMetadata,
} from "@/lib/photo-import/browser-metadata";
import { uploadManyPhotoBlobsToR2 } from "@/lib/storage/upload-photo-to-r2";

export async function createTripAlbum(
  experienceId: string,
  name: string,
): Promise<string> {
  const response = await fetch(`/api/experiences/${experienceId}/albums`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      parent_album_id: null,
    }),
  });
  const payload = (await response.json()) as {
    readonly album?: { readonly id: string };
    readonly error?: string;
  };
  if (!response.ok || !payload.album?.id) {
    throw new Error(payload.error ?? "Não foi possível criar o álbum.");
  }
  return payload.album.id;
}

export async function uploadFilesToAlbum(input: {
  readonly experienceId: string;
  readonly albumId: string;
  readonly files: readonly File[];
  readonly onProgress?: (message: string) => void;
}): Promise<{ readonly cloudWarning: string | null }> {
  const { experienceId, albumId, files, onProgress } = input;
  const prepared: Array<{
    readonly id: string;
    readonly full: Blob;
    readonly thumbnail: Blob | null;
    readonly payloadBase: {
      readonly id: string;
      readonly captured_at: string | null;
      readonly date_source: string;
      readonly exact_latitude: number | null;
      readonly exact_longitude: number | null;
      readonly width: number | null;
      readonly height: number | null;
      readonly bytes: number;
      readonly format: string | null;
    };
  }> = [];

  for (const [index, file] of files.entries()) {
    onProgress?.(`Lendo foto ${index + 1} de ${files.length}…`);
    const id = crypto.randomUUID();
    const metadata = await extractBrowserPhotoMetadata(id, file);
    const derivatives = await createBrowserPhotoDerivatives(file);
    const thumbnail = derivatives?.thumbnail ?? null;
    const preview = derivatives?.preview ?? null;
    const full = preview?.blob ?? thumbnail?.blob ?? null;
    if (!full) {
      throw new Error(
        `Não foi possível preparar a foto ${file.name || index + 1} neste navegador.`,
      );
    }
    const mapped = mapLocalDateSourceToDb(
      metadata.dateSource,
      metadata.date,
      metadata.exif.availableFields,
    );
    prepared.push({
      id,
      full,
      thumbnail: thumbnail?.blob ?? null,
      payloadBase: {
        id,
        captured_at: mapped.capturedAt,
        date_source: mapped.dateSource,
        exact_latitude: metadata.gps?.latitude ?? null,
        exact_longitude: metadata.gps?.longitude ?? null,
        width: metadata.dimensions?.width ?? thumbnail?.width ?? null,
        height: metadata.dimensions?.height ?? thumbnail?.height ?? null,
        bytes: full.size,
        format: full.type || "image/jpeg",
      },
    });
  }

  onProgress?.("Salvando fotos neste aparelho…");
  await putLocalPhotoBlobs(
    prepared.map((item) => ({
      id: item.id,
      full: item.full,
      thumbnail: item.thumbnail,
    })),
  );

  onProgress?.("Confirmando no álbum…");
  const response = await fetch(`/api/experiences/${experienceId}/photos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      placement: "album",
      photos: prepared.map((item) => ({
        ...item.payloadBase,
        album_id: albumId,
      })),
    }),
  });
  const payload = (await response.json()) as { readonly error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Não foi possível adicionar as fotos.");
  }

  onProgress?.("Enviando ao armazenamento permanente…");
  try {
    await uploadManyPhotoBlobsToR2(
      experienceId,
      prepared.map((item) => ({
        id: item.id,
        full: item.full,
        thumbnail: item.thumbnail,
      })),
      (done, total) => {
        onProgress?.(`Enviando foto ${done} de ${total}…`);
      },
    );
    return { cloudWarning: null };
  } catch (cloudError) {
    return {
      cloudWarning:
        cloudError instanceof Error
          ? cloudError.message
          : "Falha ao enviar ao armazenamento permanente.",
    };
  }
}

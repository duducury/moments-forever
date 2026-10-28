import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { mapLocalDateSourceToDb } from "@moments-forever/shared";

import { putLocalPhotoBlobs } from "@/lib/local-photos/photo-blob-store";
import { applyNativeOrigin, type NativeOrigins } from "@/lib/photo-library/native-origin";
import {
  createBrowserPhotoDerivatives,
  extractBrowserPhotoMetadata,
} from "@/lib/photo-import/browser-metadata";
import { startImportTimer } from "@/lib/perf/import-timing";
import { uploadPhotoBatchToR2 } from "@/lib/storage/upload-photo-to-r2";

export async function createTripAlbum(
  experienceId: string,
  name: string,
  description?: string,
): Promise<string> {
  const story = description?.trim() ?? "";
  const response = await fetch(`/api/experiences/${experienceId}/albums`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      parent_album_id: null,
      description: story.length > 0 ? story : null,
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
  /** Set only by "Encontrar viagem/fotos": which library photo each file came from. */
  readonly origins?: NativeOrigins;
  readonly onProgress?: (message: string) => void;
}): Promise<{
  readonly cloudWarning: string | null;
  /** The photos just added, so a failed cloud upload can be retried from this device. */
  readonly photoIds: readonly string[];
}> {
  const { experienceId, albumId, files, origins, onProgress } = input;
  type PreparedPhoto = {
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
      readonly source_asset_id?: string;
    };
  };

  const timer = startImportTimer("add-to-album");

  // CPU-bound (EXIF + one decode + resized preview/thumbnail): three at a time (one decoded
  // ≤1600 px bitmap each, ~8 MB), in input order.
  let read = 0;
  const prepared: PreparedPhoto[] = await mapWithConcurrency(
    files,
    3,
    async (file, index): Promise<PreparedPhoto> => {
      const id = crypto.randomUUID();
      const origin = origins?.get(file);
      const metadata = applyNativeOrigin(
        await extractBrowserPhotoMetadata(id, file),
        origin,
      );
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
      read += 1;
      onProgress?.(`Lendo foto ${read} de ${files.length}…`);
      return {
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
          ...(origin ? { source_asset_id: origin.sourceAssetId } : {}),
        },
      };
    },
  );

  timer.mark("prepare");
  onProgress?.("Salvando fotos neste aparelho…");
  await putLocalPhotoBlobs(
    prepared.map((item) => ({
      id: item.id,
      full: item.full,
      thumbnail: item.thumbnail,
    })),
  );

  timer.mark("save-local");
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

  timer.mark("add-to-album");

  onProgress?.("Enviando ao armazenamento permanente…");
  const photoIds = prepared.map((item) => item.id);
  try {
    const outcome = await uploadPhotoBatchToR2(
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
    timer.mark("upload");
    timer.finish({ photos: photoIds.length, failed: outcome.failed.length });
    if (outcome.failed.length === 0) return { cloudWarning: null, photoIds };
    // Only the photos that did not make it are retried (the others are already in the cloud).
    const reason = outcome.failed[0]?.error ?? "Falha ao enviar ao armazenamento permanente.";
    return {
      photoIds: outcome.failed.map((item) => item.id),
      cloudWarning:
        outcome.failed.length < photoIds.length
          ? `${outcome.failed.length} de ${photoIds.length} fotos ainda não foram enviadas. ${reason}`
          : reason,
    };
  } catch (cloudError) {
    timer.finish({ photos: photoIds.length, failed: photoIds.length });
    return {
      photoIds,
      cloudWarning:
        cloudError instanceof Error
          ? cloudError.message
          : "Falha ao enviar ao armazenamento permanente.",
    };
  }
}

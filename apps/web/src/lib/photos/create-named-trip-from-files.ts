import {
  buildExperienceDraftFromImport,
  suggestExperienceSlug,
} from "@moments-forever/shared";
import type { LocalPhotoMetadata, PhotoImportGroup } from "@moments-forever/types";

import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { putLocalPhotoBlobs } from "@/lib/local-photos/photo-blob-store";
import { applyNativeOrigin, type NativeOrigins } from "@/lib/photo-library/native-origin";
import {
  createBrowserPhotoDerivatives,
  extractBrowserPhotoMetadata,
} from "@/lib/photo-import/browser-metadata";
import { startImportTimer } from "@/lib/perf/import-timing";
import { uploadPhotoBatchToR2, type PhotoUploadOutcome } from "@/lib/storage/upload-photo-to-r2";

export type TripLicenseErrorCode = "no_active_license" | "trip_limit_reached";

/** Thrown when the server blocks trip creation for a licensing reason, so callers can offer to activate a code instead of just showing a generic error. */
export class TripLicenseError extends Error {
  constructor(
    readonly code: TripLicenseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TripLicenseError";
  }
}

const PREPARE_CONCURRENCY = 3;

/**
 * Creates one trip + one named album and uploads the chosen photos.
 * Skips the GPS group / “juntar lugares” review — destination choice is final.
 */
export async function createNamedTripFromFiles(input: {
  readonly files: readonly File[];
  /** The photo the person starred as the cover; defaults to the first file. */
  readonly coverFile?: File | null;
  readonly name: string;
  readonly story?: string;
  readonly ownerId: string;
  /** Set only by "Encontrar viagem": which library photo each file came from. */
  readonly origins?: NativeOrigins;
  readonly onProgress?: (message: string) => void;
}): Promise<{
  readonly experienceId: string;
  readonly slug: string;
  readonly albumId: string;
  readonly cloudWarning: string | null;
  /** The photos just added, so a failed cloud upload can be retried from this device. */
  readonly photoIds: readonly string[];
}> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Escolha um nome para o álbum.");
  }
  if (input.files.length === 0) {
    throw new Error("Selecione ao menos uma foto.");
  }

  const timer = startImportTimer("new-trip");

  // Preparing a photo (EXIF + one decode + resized preview/thumbnail) is CPU-bound;
  // three at a time (each holds one decoded ≤1600 px bitmap, ~8 MB) is a good trade
  // between speed and a phone's memory.
  let prepared = 0;
  const preparedPhotos = await mapWithConcurrency(
    input.files,
    PREPARE_CONCURRENCY,
    async (file, index) => {
      const id = crypto.randomUUID();
      const metadata = applyNativeOrigin(
        await extractBrowserPhotoMetadata(id, file),
        input.origins?.get(file),
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
      prepared += 1;
      input.onProgress?.(
        `Preparando foto ${prepared} de ${input.files.length}…`,
      );
      return {
        metadata,
        blob: { id, full, thumbnail: thumbnail?.blob ?? null },
      };
    },
  );
  timer.mark("prepare");
  const photos: LocalPhotoMetadata[] = preparedPhotos.map((item) => item.metadata);
  const blobs = preparedPhotos.map((item) => item.blob);

  // The starred photo (or the first one) becomes the cover. The draft would
  // otherwise pick "first by date", ignoring the star.
  const coverIndex = Math.max(
    0,
    input.coverFile ? input.files.indexOf(input.coverFile) : 0,
  );
  const coverPhotoId = blobs[coverIndex]?.id ?? null;

  const groupId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `group-${Date.now()}`;
  const group: PhotoImportGroup = {
    id: groupId,
    kind: "manual",
    label: name,
    photoIds: photos.map((photo) => photo.id),
    roundedGps: null,
    date: null,
  };

  const slug = suggestExperienceSlug(name);
  const builtDraft = buildExperienceDraftFromImport({
    ownerId: input.ownerId,
    title: name,
    slug,
    photos,
    groups: [group],
    selectedIds: photos.map((photo) => photo.id),
    description: input.story?.trim() || null,
  });

  const draft =
    coverPhotoId && builtDraft.photos.some((photo) => photo.id === coverPhotoId)
      ? {
          ...builtDraft,
          experience: { ...builtDraft.experience, coverPhotoId },
        }
      : builtDraft;

  if (draft.photos.length === 0 || draft.moments.length === 0) {
    throw new Error("Nenhuma foto válida para criar o álbum.");
  }

  input.onProgress?.("Salvando fotos neste aparelho…");
  await putLocalPhotoBlobs(blobs);
  timer.mark("save-local");

  input.onProgress?.("Criando álbum…");
  const response = await fetch("/api/experiences/from-import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      draft,
      albumStory: input.story?.trim() ?? "",
      organization: {
        mode: "single",
        rootName: name,
        children: [],
      },
    }),
  });
  const body = (await response.json()) as {
    readonly id?: string;
    readonly slug?: string;
    readonly error?: string;
    readonly code?: string;
  };
  if (!response.ok || !body.id || !body.slug) {
    if (body.code === "no_active_license" || body.code === "trip_limit_reached") {
      throw new TripLicenseError(
        body.code,
        body.error ?? "Você precisa ativar uma key para criar uma viagem.",
      );
    }
    throw new Error(body.error ?? "Não foi possível criar o álbum.");
  }

  timer.mark("create-trip");
  const experienceId = body.id;
  const createdSlug = body.slug;
  const photoIds = blobs.map((blob) => blob.id);

  // The photos already exist on their rows, so the cloud upload starts NOW and runs alongside the album lookup,
  // the library-origin record and the cover (none of which the upload waits for, or the other way round).
  input.onProgress?.("Enviando ao armazenamento permanente…");
  const uploading: Promise<PhotoUploadOutcome | Error> = uploadPhotoBatchToR2(
    experienceId,
    blobs,
    (done, total) => {
      input.onProgress?.(`Enviando foto ${done} de ${total}…`);
    },
  )
    .then((outcome) => {
      timer.mark("upload");
      return outcome;
    })
    .catch((error: unknown) => (error instanceof Error ? error : new Error("Falha ao enviar ao armazenamento permanente.")));

  // New trips are created through the import RPC, which does not carry the
  // library origin: record it (best effort — the photos exist either way).
  const recordOrigins = (async () => {
    if (!input.origins || input.origins.size === 0) return;
    const items = input.files.flatMap((file, index) => {
      const origin = input.origins?.get(file);
      const photoId = blobs[index]?.id;
      return origin && photoId
        ? [{ photo_id: photoId, source_asset_id: origin.sourceAssetId }]
        : [];
    });
    if (items.length === 0) return;
    try {
      await fetch(`/api/experiences/${experienceId}/photos/source-assets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
    } catch {
      // Only weakens duplicate detection for this trip.
    }
  })();

  const findAlbum = (async (): Promise<string> => {
    const albumsResponse = await fetch(`/api/experiences/${experienceId}/albums`);
    const albumsBody = (await albumsResponse.json()) as {
      readonly albums?: ReadonlyArray<{
        readonly id: string;
        readonly parent_album_id: string | null;
        readonly position: number;
      }>;
      readonly error?: string;
    };
    if (!albumsResponse.ok) {
      throw new Error(albumsBody.error ?? "Álbum criado, mas sem pasta.");
    }
    const roots = (albumsBody.albums ?? [])
      .filter((album) => album.parent_album_id == null)
      .sort((left, right) => left.position - right.position);
    const found = roots[0]?.id;
    if (!found) {
      throw new Error("Álbum criado, mas a pasta principal não foi encontrada.");
    }
    // Make the starred photo the album's cover too (that is what the profile card shows).
    if (coverPhotoId) {
      try {
        await fetch(`/api/albums/${found}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cover_photo_id: coverPhotoId }),
        });
      } catch {
        // Best effort: the album still exists, the cover can be changed in "Editar".
      }
    }
    return found;
  })();

  // Wait for everything: "Pronto!" is only shown once the photos are saved AND the album is complete.
  const [albumResult, uploadResult] = await Promise.allSettled([findAlbum, uploading, recordOrigins]).then(
    (results) => [results[0], results[1]] as const,
  );
  timer.mark("album-details");
  if (albumResult.status === "rejected") {
    // The trip and the photo rows exist (and their files were sent): report what could not be found, don't duplicate.
    throw albumResult.reason instanceof Error ? albumResult.reason : new Error("Álbum criado, mas sem pasta.");
  }
  const albumId = albumResult.value;
  const outcome = uploadResult.status === "fulfilled" ? uploadResult.value : null;

  if (outcome && !(outcome instanceof Error) && outcome.failed.length === 0) {
    timer.finish({ photos: blobs.length, failed: 0 });
    return { experienceId, slug: createdSlug, albumId, cloudWarning: null, photoIds };
  }

  // Some photos did not reach the cloud: they are on this device and on their rows, so only THOSE are retried.
  const failedIds =
    outcome && !(outcome instanceof Error) ? outcome.failed.map((item) => item.id) : photoIds;
  const reason =
    outcome && !(outcome instanceof Error)
      ? (outcome.failed[0]?.error ?? "Falha ao enviar ao armazenamento permanente.")
      : (outcome?.message ?? "Falha ao enviar ao armazenamento permanente.");
  timer.finish({ photos: blobs.length, failed: failedIds.length });
  return {
    experienceId,
    slug: createdSlug,
    albumId,
    photoIds: failedIds,
    cloudWarning:
      failedIds.length < blobs.length
        ? `${failedIds.length} de ${blobs.length} fotos ainda não foram enviadas. ${reason}`
        : reason,
  };
}

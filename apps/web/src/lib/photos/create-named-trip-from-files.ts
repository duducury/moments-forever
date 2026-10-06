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
import { uploadManyPhotoBlobsToR2 } from "@/lib/storage/upload-photo-to-r2";

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

const PREPARE_CONCURRENCY = 2;

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

  // Preparing a photo (EXIF + resized preview/thumbnail) is CPU-bound; two at a
  // time is a good trade between speed and a phone's memory.
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

  const albumsResponse = await fetch(`/api/experiences/${body.id}/albums`);
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
  const albumId = roots[0]?.id;
  if (!albumId) {
    throw new Error("Álbum criado, mas a pasta principal não foi encontrada.");
  }

  // New trips are created through the import RPC, which does not carry the
  // library origin: record it afterwards (best effort — the photos exist either way).
  if (input.origins && input.origins.size > 0) {
    const items = input.files.flatMap((file, index) => {
      const origin = input.origins?.get(file);
      const photoId = blobs[index]?.id;
      return origin && photoId
        ? [{ photo_id: photoId, source_asset_id: origin.sourceAssetId }]
        : [];
    });
    if (items.length > 0) {
      try {
        await fetch(`/api/experiences/${body.id}/photos/source-assets`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items }),
        });
      } catch {
        // Only weakens duplicate detection for this trip.
      }
    }
  }

  // Make the starred photo the album's cover too (that is what the profile card shows).
  if (coverPhotoId) {
    try {
      await fetch(`/api/albums/${albumId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cover_photo_id: coverPhotoId }),
      });
    } catch {
      // Best effort: the album still exists, the cover can be changed in "Editar".
    }
  }

  input.onProgress?.("Enviando ao armazenamento permanente…");
  try {
    await uploadManyPhotoBlobsToR2(body.id, blobs, (done, total) => {
      input.onProgress?.(`Enviando foto ${done} de ${total}…`);
    });
    return {
      experienceId: body.id,
      slug: body.slug,
      albumId,
      cloudWarning: null,
      photoIds: blobs.map((blob) => blob.id),
    };
  } catch (cloudError) {
    return {
      experienceId: body.id,
      slug: body.slug,
      albumId,
      photoIds: blobs.map((blob) => blob.id),
      cloudWarning:
        cloudError instanceof Error
          ? cloudError.message
          : "Falha ao enviar ao armazenamento permanente.",
    };
  }
}

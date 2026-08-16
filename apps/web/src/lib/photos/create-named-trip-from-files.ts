import {
  buildExperienceDraftFromImport,
  suggestExperienceSlug,
} from "@moments-forever/shared";
import type { LocalPhotoMetadata, PhotoImportGroup } from "@moments-forever/types";

import { putLocalPhotoBlobs } from "@/lib/local-photos/photo-blob-store";
import {
  createBrowserPhotoDerivatives,
  extractBrowserPhotoMetadata,
} from "@/lib/photo-import/browser-metadata";
import { uploadManyPhotoBlobsToR2 } from "@/lib/storage/upload-photo-to-r2";

/**
 * Creates one trip + one named album and uploads the chosen photos.
 * Skips the GPS group / “juntar lugares” review — destination choice is final.
 */
export async function createNamedTripFromFiles(input: {
  readonly files: readonly File[];
  readonly name: string;
  readonly story?: string;
  readonly ownerId: string;
  readonly onProgress?: (message: string) => void;
}): Promise<{
  readonly experienceId: string;
  readonly slug: string;
  readonly albumId: string;
  readonly cloudWarning: string | null;
}> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Escolha um nome para o álbum.");
  }
  if (input.files.length === 0) {
    throw new Error("Selecione ao menos uma foto.");
  }

  const photos: LocalPhotoMetadata[] = [];
  const blobs: Array<{
    readonly id: string;
    readonly full: Blob;
    readonly thumbnail: Blob | null;
  }> = [];

  for (const [index, file] of input.files.entries()) {
    input.onProgress?.(
      `Preparando foto ${index + 1} de ${input.files.length}…`,
    );
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
    photos.push(metadata);
    blobs.push({
      id,
      full,
      thumbnail: thumbnail?.blob ?? null,
    });
  }

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
  const draft = buildExperienceDraftFromImport({
    ownerId: input.ownerId,
    title: name,
    slug,
    photos,
    groups: [group],
    selectedIds: photos.map((photo) => photo.id),
    description: input.story?.trim() || null,
  });

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
  };
  if (!response.ok || !body.id || !body.slug) {
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
    };
  } catch (cloudError) {
    return {
      experienceId: body.id,
      slug: body.slug,
      albumId,
      cloudWarning:
        cloudError instanceof Error
          ? cloudError.message
          : "Falha ao enviar ao armazenamento permanente.",
    };
  }
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { mapLocalDateSourceToDb } from "@moments-forever/shared";

import { putLocalPhotoBlobs } from "@/lib/local-photos/photo-blob-store";
import {
  createBrowserThumbnail,
  extractBrowserPhotoMetadata,
} from "@/lib/photo-import/browser-metadata";
import { uploadManyPhotoBlobsToR2 } from "@/lib/storage/upload-photo-to-r2";

import type { TripAlbum } from "./album-types";
import styles from "./trip.module.css";

interface Props {
  readonly experienceId: string;
  readonly albums: readonly TripAlbum[];
  readonly defaultAlbumId: string | null;
  readonly onClose: () => void;
  readonly onAdded?: () => void;
}

async function createAlbum(
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
    throw new Error(payload.error ?? "Não foi possível criar o lugar.");
  }
  return payload.album.id;
}

export function AddPhotosPanel({
  experienceId,
  albums,
  defaultAlbumId,
  onClose,
  onAdded,
}: Props) {
  const router = useRouter();
  const sortedAlbums = useMemo(
    () =>
      albums
        .slice()
        .sort(
          (a, b) =>
            a.position - b.position ||
            a.displayName.localeCompare(b.displayName),
        ),
    [albums],
  );
  const initialAlbumId =
    defaultAlbumId && sortedAlbums.some((album) => album.id === defaultAlbumId)
      ? defaultAlbumId
      : (sortedAlbums.find((album) => album.parentAlbumId === null)?.id ??
        sortedAlbums[0]?.id ??
        "");

  const [albumId, setAlbumId] = useState(initialAlbumId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function onFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    setBusy(true);
    setError(null);
    setProgress(
      `Preparando ${fileList.length} foto${fileList.length === 1 ? "" : "s"}…`,
    );

    try {
      const files = Array.from(fileList);
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
        setProgress(`Lendo foto ${index + 1} de ${files.length}…`);
        const id = crypto.randomUUID();
        const metadata = await extractBrowserPhotoMetadata(id, file);
        const thumbnail = await createBrowserThumbnail(file);
        const mapped = mapLocalDateSourceToDb(
          metadata.dateSource,
          metadata.date,
          metadata.exif.availableFields,
        );
        prepared.push({
          id,
          full: file,
          thumbnail: thumbnail?.blob ?? null,
          payloadBase: {
            id,
            captured_at: mapped.capturedAt,
            date_source: mapped.dateSource,
            exact_latitude: metadata.gps?.latitude ?? null,
            exact_longitude: metadata.gps?.longitude ?? null,
            width: metadata.dimensions?.width ?? thumbnail?.width ?? null,
            height: metadata.dimensions?.height ?? thumbnail?.height ?? null,
            bytes: metadata.size,
            format: metadata.type || null,
          },
        });
      }

      setProgress("Salvando fotos localmente…");
      await putLocalPhotoBlobs(
        prepared.map((item) => ({
          id: item.id,
          full: item.full,
          thumbnail: item.thumbnail,
        })),
      );

      let targetAlbumId = albumId;
      if (!targetAlbumId) {
        setProgress("Criando lugar…");
        targetAlbumId = await createAlbum(experienceId, "Viagem");
        setAlbumId(targetAlbumId);
      }

      setProgress("Confirmando na viagem…");
      const response = await fetch(`/api/experiences/${experienceId}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          placement: "album",
          photos: prepared.map((item) => ({
            ...item.payloadBase,
            album_id: targetAlbumId,
          })),
        }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível adicionar as fotos.");
      }

      setProgress("Enviando ao armazenamento permanente…");
      let cloudWarning: string | null = null;
      try {
        await uploadManyPhotoBlobsToR2(
          experienceId,
          prepared.map((item) => ({
            id: item.id,
            full: item.full,
            thumbnail: item.thumbnail,
          })),
          (done, total) => {
            setProgress(`Enviando foto ${done} de ${total}…`);
          },
        );
      } catch (cloudError) {
        cloudWarning =
          cloudError instanceof Error
            ? cloudError.message
            : "Falha ao enviar ao armazenamento permanente.";
      }

      onAdded?.();
      router.refresh();
      if (cloudWarning) {
        setError(
          `Fotos guardadas neste aparelho, mas o envio à nuvem falhou: ${cloudWarning}`,
        );
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar fotos.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div
      aria-label="Adicionar fotos"
      aria-modal="true"
      className={styles.panel}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      role="dialog"
    >
      <div className={styles.panelCard}>
        <h2>Adicionar fotos à viagem</h2>
        <p className={styles.sectionHint}>
          As fotos entram nesta viagem com o GPS preservado. Para separar ou
          unir pastas, use Organizar lugares depois do upload.
        </p>

        {sortedAlbums.length > 0 ? (
          <>
            <label htmlFor="add-photos-album">Lugar de destino</label>
            <select
              disabled={busy}
              id="add-photos-album"
              onChange={(event) => setAlbumId(event.target.value)}
              value={albumId}
            >
              {sortedAlbums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.displayName}
                  {album.parentAlbumId ? " (subálbum)" : ""}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className={styles.sectionHint}>
            Um lugar será criado automaticamente para receber as fotos.
          </p>
        )}

        <label className={styles.addPhotosFileLabel} htmlFor="add-photos-files">
          {busy ? "Adicionando…" : "Escolher fotos"}
          <input
            accept="image/*"
            disabled={busy}
            id="add-photos-files"
            multiple
            onChange={(event) => {
              void onFilesSelected(event.target.files);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>

        {progress ? <p className={styles.sectionHint}>{progress}</p> : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.panelActions}>
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

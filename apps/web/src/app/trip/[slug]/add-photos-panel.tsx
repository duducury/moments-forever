"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  createTripAlbum,
  uploadFilesToAlbum,
} from "@/lib/photos/upload-files-to-album";

import type { TripAlbum } from "./album-types";
import styles from "./trip.module.css";

const NEW_ALBUM_VALUE = "__new__";

interface Props {
  readonly experienceId: string;
  readonly albums: readonly TripAlbum[];
  readonly defaultAlbumId: string | null;
  /** When true, photos always go to defaultAlbumId — no destination picker. */
  readonly lockToAlbum?: boolean;
  readonly onClose: () => void;
  readonly onAdded?: () => void;
}

export function AddPhotosPanel({
  experienceId,
  albums,
  defaultAlbumId,
  lockToAlbum = false,
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
        NEW_ALBUM_VALUE);

  const [albumId, setAlbumId] = useState(initialAlbumId);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const lockedAlbum =
    lockToAlbum && defaultAlbumId
      ? (sortedAlbums.find((item) => item.id === defaultAlbumId) ?? null)
      : null;
  const creatingNew =
    !lockedAlbum &&
    (albumId === NEW_ALBUM_VALUE || sortedAlbums.length === 0);

  async function onFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    setBusy(true);
    setError(null);
    setProgress(
      `Preparando ${fileList.length} foto${fileList.length === 1 ? "" : "s"}…`,
    );

    try {
      const files = Array.from(fileList);
      let targetAlbumId = lockedAlbum?.id ?? (creatingNew ? "" : albumId);
      if (!targetAlbumId) {
        const name = newAlbumName.trim() || "Novo álbum";
        setProgress("Criando álbum…");
        targetAlbumId = await createTripAlbum(experienceId, name);
        setAlbumId(targetAlbumId);
      }

      const result = await uploadFilesToAlbum({
        experienceId,
        albumId: targetAlbumId,
        files,
        onProgress: setProgress,
      });

      onAdded?.();
      router.refresh();
      if (result.cloudWarning) {
        setError(
          `Fotos guardadas neste aparelho, mas o envio à nuvem falhou: ${result.cloudWarning}`,
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
        <h2>Adicionar fotos</h2>
        <p className={styles.sectionHint}>
          {lockedAlbum
            ? `As fotos entram em ${lockedAlbum.displayName}.`
            : "Escolha várias fotos e coloque neste álbum ou crie um novo nesta viagem."}
        </p>

        {lockedAlbum ? null : sortedAlbums.length > 0 ? (
          <>
            <label htmlFor="add-photos-album">Álbum de destino</label>
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
              <option value={NEW_ALBUM_VALUE}>Criar novo álbum…</option>
            </select>
          </>
        ) : (
          <p className={styles.sectionHint}>
            Ainda não há álbum nesta viagem. Dê um nome e as fotos entram nele.
          </p>
        )}

        {creatingNew ? (
          <>
            <label htmlFor="add-photos-new-name">Nome do novo álbum</label>
            <input
              disabled={busy}
              id="add-photos-new-name"
              onChange={(event) => setNewAlbumName(event.target.value)}
              placeholder="Jamaica, Paris…"
              value={newAlbumName}
            />
          </>
        ) : null}

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

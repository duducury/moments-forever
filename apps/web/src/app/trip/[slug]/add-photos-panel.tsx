"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import {
  createTripAlbum,
  uploadFilesToAlbum,
} from "@/lib/photos/upload-files-to-album";
import { countryCodeFromPlaceLabel } from "@moments-forever/shared";

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

  const [albumId, setAlbumId] = useState(
    lockToAlbum && defaultAlbumId ? defaultAlbumId : NEW_ALBUM_VALUE,
  );
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumStory, setNewAlbumStory] = useState("");
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
        const name = newAlbumName.trim();
        if (!name) {
          setError("Escolha um nome para o álbum.");
          setBusy(false);
          setProgress(null);
          return;
        }
        setProgress("Criando álbum…");
        targetAlbumId = await createTripAlbum(
          experienceId,
          name,
          newAlbumStory,
        );
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
            : "Crie um álbum novo ou escolha um que já existe."}
        </p>

        {lockedAlbum ? null : (
          <div className={styles.addPhotosPicker} role="listbox">
            <button
              aria-selected={creatingNew}
              className={styles.addPhotosPick}
              data-selected={creatingNew ? "true" : "false"}
              disabled={busy}
              onClick={() => setAlbumId(NEW_ALBUM_VALUE)}
              role="option"
              type="button"
            >
              <span className={styles.addPhotosPickNew} aria-hidden>
                +
              </span>
              <span className={styles.addPhotosPickCopy}>
                <strong>Criar novo álbum de viagem</strong>
              </span>
            </button>

            {sortedAlbums.map((album) => {
              const countryCode =
                countryCodeFromPlaceLabel(album.displayName) ??
                countryCodeFromPlaceLabel(album.placeName ?? "");
              const selected = albumId === album.id;
              return (
                <button
                  aria-selected={selected}
                  className={styles.addPhotosPick}
                  data-selected={selected ? "true" : "false"}
                  disabled={busy}
                  key={album.id}
                  onClick={() => setAlbumId(album.id)}
                  role="option"
                  type="button"
                >
                  <ExperienceCoverThumb
                    className={styles.addPhotosPickCover}
                    coverPhotoId={album.coverPhotoId}
                    fallbackClassName={styles.addPhotosPickCoverFallback}
                    imageClassName={styles.addPhotosPickCoverImage}
                    title={album.displayName}
                    variant="thumbnail"
                  />
                  <span className={styles.addPhotosPickCopy}>
                    <strong>
                      {countryCode ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
                        <img
                          alt=""
                          className={styles.addPhotosPickFlag}
                          decoding="async"
                          height={15}
                          src={`https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`}
                          width={20}
                        />
                      ) : null}
                      {album.displayName}
                    </strong>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {creatingNew ? (
          <>
            <label htmlFor="add-photos-new-name">Nome do álbum</label>
            <input
              disabled={busy}
              id="add-photos-new-name"
              onChange={(event) => setNewAlbumName(event.target.value)}
              placeholder="Jamaica, Paris…"
              value={newAlbumName}
            />
            <label htmlFor="add-photos-new-story">Sobre essa viagem</label>
            <textarea
              className={styles.textarea}
              disabled={busy}
              id="add-photos-new-story"
              maxLength={4000}
              onChange={(event) => setNewAlbumStory(event.target.value)}
              placeholder="O que essa viagem significou para você?"
              rows={5}
              value={newAlbumStory}
            />
          </>
        ) : null}

        <label className={styles.addPhotosFileLabel} htmlFor="add-photos-files">
          {busy
            ? "Adicionando…"
            : creatingNew && !newAlbumName.trim()
              ? "Dê um nome ao álbum"
              : "Escolher fotos"}
          <input
            accept="image/*"
            disabled={busy || (creatingNew && !newAlbumName.trim())}
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

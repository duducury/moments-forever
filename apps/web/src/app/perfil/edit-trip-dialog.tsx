"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { mapLocalDateSourceToDb } from "@moments-forever/shared";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import type { OwnerExperienceListItem } from "@/lib/experiences/load-owner-experiences";
import {
  deleteLocalPhotoBlobs,
  putLocalPhotoBlobs,
} from "@/lib/local-photos/photo-blob-store";
import {
  createBrowserPhotoDerivatives,
  extractBrowserPhotoMetadata,
} from "@/lib/photo-import/browser-metadata";
import { clearCardPreviewPrefs } from "@/lib/profile/card-preview-prefs";
import { uploadManyPhotoBlobsToR2 } from "@/lib/storage/upload-photo-to-r2";

import styles from "./perfil.module.css";

interface PhotoOption {
  readonly id: string;
  readonly album_id: string | null;
}

interface AlbumOption {
  readonly id: string;
  readonly name: string;
  readonly parent_album_id: string | null;
  readonly photo_count: number;
}

type DialogTab = "card" | "delete";

async function ensureRootAlbumId(
  experienceId: string,
  albums: readonly AlbumOption[],
): Promise<string> {
  const existing = albums.find((album) => album.parent_album_id === null);
  if (existing) return existing.id;

  const response = await fetch(`/api/experiences/${experienceId}/albums`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Viagem",
      parent_album_id: null,
    }),
  });
  const payload = (await response.json()) as {
    readonly album?: { readonly id: string };
    readonly error?: string;
  };
  if (!response.ok || !payload.album?.id) {
    throw new Error(payload.error ?? "Não foi possível criar um lugar.");
  }
  return payload.album.id;
}

export function EditTripDialog({
  experience,
  onClose,
}: {
  readonly experience: OwnerExperienceListItem;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<DialogTab>("card");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [photos, setPhotos] = useState<readonly PhotoOption[]>([]);
  const [albums, setAlbums] = useState<readonly AlbumOption[]>([]);
  const [coverPhotoId, setCoverPhotoId] = useState(experience.coverPhotoId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [photosRes, albumsRes] = await Promise.all([
          fetch(`/api/experiences/${experience.id}/photos`),
          fetch(`/api/experiences/${experience.id}/albums`),
        ]);
        const photosPayload = (await photosRes.json()) as {
          readonly photos?: readonly PhotoOption[];
          readonly error?: string;
        };
        const albumsPayload = (await albumsRes.json()) as {
          readonly albums?: readonly AlbumOption[];
          readonly error?: string;
        };
        if (!photosRes.ok) {
          throw new Error(photosPayload.error ?? "Falha ao carregar fotos.");
        }
        if (!albumsRes.ok) {
          throw new Error(albumsPayload.error ?? "Falha ao carregar pastas.");
        }
        if (!cancelled) {
          setPhotos(photosPayload.photos ?? []);
          setAlbums(albumsPayload.albums ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao carregar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [experience.id]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/experiences/${experience.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") ?? ""),
          starts_at: String(data.get("starts_at") ?? "") || null,
          ends_at: String(data.get("ends_at") ?? "") || null,
          cover_photo_id: coverPhotoId,
        }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível salvar.");
      }
      clearCardPreviewPrefs(experience.id);
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function addCoverFromCameraRoll(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Escolha uma imagem do rolo da câmera.");
      return;
    }

    setBusy(true);
    setError(null);
    setProgress("Preparando foto…");
    try {
      const id = crypto.randomUUID();
      const metadata = await extractBrowserPhotoMetadata(id, file);
      const derivatives = await createBrowserPhotoDerivatives(file);
      const thumbnail = derivatives?.thumbnail ?? null;
      const preview = derivatives?.preview ?? null;
      const full = preview?.blob ?? thumbnail?.blob ?? null;
      if (!full) {
        throw new Error("Não foi possível preparar a foto neste navegador.");
      }
      const mapped = mapLocalDateSourceToDb(
        metadata.dateSource,
        metadata.date,
        metadata.exif.availableFields,
      );
      const albumId = await ensureRootAlbumId(experience.id, albums);

      setProgress("Salvando no aparelho…");
      await putLocalPhotoBlobs([
        {
          id,
          full,
          thumbnail: thumbnail?.blob ?? null,
        },
      ]);

      setProgress("Adicionando à viagem…");
      const response = await fetch(`/api/experiences/${experience.id}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          placement: "album",
          photos: [
            {
              id,
              album_id: albumId,
              captured_at: mapped.capturedAt,
              date_source: mapped.dateSource,
              exact_latitude: metadata.gps?.latitude ?? null,
              exact_longitude: metadata.gps?.longitude ?? null,
              width: metadata.dimensions?.width ?? thumbnail?.width ?? null,
              height: metadata.dimensions?.height ?? thumbnail?.height ?? null,
              bytes: full.size,
              format: full.type || "image/jpeg",
            },
          ],
        }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível adicionar a foto.");
      }

      setProgress("Enviando ao armazenamento…");
      try {
        await uploadManyPhotoBlobsToR2(experience.id, [
          { id, full, thumbnail: thumbnail?.blob ?? null },
        ]);
      } catch (cloudError) {
        setError(
          cloudError instanceof Error
            ? `Capa adicionada neste aparelho, mas o envio à nuvem falhou: ${cloudError.message}`
            : "Capa adicionada, mas o envio à nuvem falhou.",
        );
      }

      setPhotos((current) => [{ id, album_id: albumId }, ...current]);
      setCoverPhotoId(id);
      if (!albums.some((album) => album.id === albumId)) {
        setAlbums((current) => [
          {
            id: albumId,
            name: "Viagem",
            parent_album_id: null,
            photo_count: 1,
          },
          ...current,
        ]);
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao importar a foto.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function deletePhoto(photoId: string) {
    if (
      !window.confirm(
        "Excluir esta foto? Ela some da viagem e deste dispositivo.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível excluir a foto.");
      }
      await deleteLocalPhotoBlobs([photoId]);
      setPhotos((current) => current.filter((photo) => photo.id !== photoId));
      if (coverPhotoId === photoId) {
        setCoverPhotoId(null);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir foto.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTrip() {
    if (
      !window.confirm(
        `Excluir a viagem “${experience.title}” por completo? Pastas, fotos e o card somem. Não dá para desfazer.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/experiences/${experience.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        readonly error?: string;
        readonly deleted_photo_ids?: readonly string[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível excluir a viagem.");
      }
      const deletedIds = payload.deleted_photo_ids ?? [];
      if (deletedIds.length > 0) {
        await deleteLocalPhotoBlobs([...deletedIds]);
      }
      clearCardPreviewPrefs(experience.id);
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir viagem.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAlbum(album: AlbumOption) {
    const force = album.photo_count > 0;
    const message = force
      ? `Excluir a pasta “${album.name}” e todas as fotos dentro dela?`
      : `Excluir a pasta vazia “${album.name}”?`;
    if (!window.confirm(message)) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/albums/${album.id}${force ? "?force=1" : ""}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        readonly error?: string;
        readonly deleted_photo_ids?: readonly string[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível excluir a pasta.");
      }
      const deletedIds = payload.deleted_photo_ids ?? [];
      if (deletedIds.length > 0) {
        await deleteLocalPhotoBlobs([...deletedIds]);
      }
      const [photosRes, albumsRes] = await Promise.all([
        fetch(`/api/experiences/${experience.id}/photos`),
        fetch(`/api/experiences/${experience.id}/albums`),
      ]);
      const photosPayload = (await photosRes.json()) as {
        readonly photos?: readonly PhotoOption[];
      };
      const albumsPayload = (await albumsRes.json()) as {
        readonly albums?: readonly AlbumOption[];
      };
      if (photosRes.ok) setPhotos(photosPayload.photos ?? []);
      if (albumsRes.ok) setAlbums(albumsPayload.albums ?? []);
      if (deletedIds.length > 0) {
        const removed = new Set(deletedIds);
        if (coverPhotoId && removed.has(coverPhotoId)) {
          setCoverPhotoId(null);
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir pasta.");
    } finally {
      setBusy(false);
    }
  }

  const rootAlbums = albums.filter((album) => album.parent_album_id === null);

  return (
    <div
      aria-label="Editar viagem"
      aria-modal="true"
      className={styles.dialogBackdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className={`${styles.dialogCard} ${styles.dialogCardWide}`}>
        <h2 className={styles.dialogTitle}>Editar viagem</h2>

        <div className={styles.dialogTabs} role="tablist">
          <button
            aria-selected={tab === "card"}
            className={styles.dialogTab}
            data-active={tab === "card" ? "true" : "false"}
            onClick={() => setTab("card")}
            role="tab"
            type="button"
          >
            Card e capa
          </button>
          <button
            aria-selected={tab === "delete"}
            className={styles.dialogTab}
            data-active={tab === "delete" ? "true" : "false"}
            onClick={() => setTab("delete")}
            role="tab"
            type="button"
          >
            Excluir
          </button>
        </div>

        {tab === "card" ? (
          <form className={styles.dialogForm} onSubmit={(e) => void onSubmit(e)}>
            <label htmlFor="trip-title">Nome</label>
            <input
              defaultValue={experience.title}
              id="trip-title"
              name="title"
              required
            />

            <label htmlFor="trip-starts">Início</label>
            <input
              defaultValue={
                experience.startsAt ? experience.startsAt.slice(0, 10) : ""
              }
              id="trip-starts"
              name="starts_at"
              type="date"
            />

            <label htmlFor="trip-ends">Fim</label>
            <input
              defaultValue={
                experience.endsAt ? experience.endsAt.slice(0, 10) : ""
              }
              id="trip-ends"
              name="ends_at"
              type="date"
            />

            {loading ? (
              <p className={styles.fieldHint}>Carregando fotos…</p>
            ) : (
              <fieldset className={styles.coverPicker}>
                <legend>Foto de capa do card</legend>
                <p className={styles.fieldHint}>
                  Escolha uma foto da viagem ou importe do rolo da câmera.
                </p>
                <div className={styles.coverFromPhoneRow}>
                  <input
                    accept="image/*"
                    className={styles.srOnlyFile}
                    onChange={(event) => {
                      void addCoverFromCameraRoll(event.target.files);
                      event.target.value = "";
                    }}
                    ref={coverFileRef}
                    type="file"
                  />
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => coverFileRef.current?.click()}
                    type="button"
                  >
                    Do rolo da câmera
                  </button>
                </div>
                {progress ? <p className={styles.fieldHint}>{progress}</p> : null}
                <div className={styles.coverChoices}>
                  {photos.map((photo) => (
                    <button
                      aria-pressed={coverPhotoId === photo.id}
                      className={styles.coverChoice}
                      data-selected={
                        coverPhotoId === photo.id ? "true" : "false"
                      }
                      key={photo.id}
                      onClick={() => setCoverPhotoId(photo.id)}
                      type="button"
                    >
                      <ExperienceCoverThumb
                        className={styles.coverChoiceThumb}
                        coverPhotoId={photo.id}
                        fallbackClassName={styles.coverFallback}
                        imageClassName={styles.coverImage}
                        title={experience.title}
                        variant="thumbnail"
                      />
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div className={styles.dialogActions}>
              <button className="button primary" disabled={busy} type="submit">
                {busy ? "Salvando…" : "Salvar"}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={onClose}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.deletePanel}>
            <p className={styles.fieldHint}>
              Excluir remove metadados no servidor e os pixels deste
              dispositivo. Não dá para desfazer.
            </p>

            <div className={styles.deleteTripBox}>
              <div>
                <h3 className={styles.deleteSectionTitle}>Viagem inteira</h3>
                <p className={styles.fieldHint}>
                  Remove o card, pastas e todas as fotos desta viagem.
                </p>
              </div>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void deleteTrip()}
                type="button"
              >
                Excluir viagem
              </button>
            </div>

            <h3 className={styles.deleteSectionTitle}>Pastas / lugares</h3>
            {loading ? (
              <p className={styles.fieldHint}>Carregando…</p>
            ) : rootAlbums.length === 0 ? (
              <p className={styles.fieldHint}>Nenhuma pasta nesta viagem.</p>
            ) : (
              <ul className={styles.deleteList}>
                {rootAlbums.map((album) => (
                  <li className={styles.deleteRow} key={album.id}>
                    <span>
                      {album.name}
                      <span className={styles.placeMeta}>
                        {" "}
                        · {album.photo_count} foto
                        {album.photo_count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void deleteAlbum(album)}
                      type="button"
                    >
                      Excluir
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <h3 className={styles.deleteSectionTitle}>Fotos</h3>
            {loading ? null : photos.length === 0 ? (
              <p className={styles.fieldHint}>Nenhuma foto nesta viagem.</p>
            ) : (
              <div className={styles.deletePhotoGrid}>
                {photos.map((photo) => (
                  <div className={styles.deletePhotoTile} key={photo.id}>
                    <ExperienceCoverThumb
                      className={styles.coverChoiceThumb}
                      coverPhotoId={photo.id}
                      fallbackClassName={styles.coverFallback}
                      imageClassName={styles.coverImage}
                      title={experience.title}
                      variant="thumbnail"
                    />
                    <button
                      className={styles.deletePhotoButton}
                      disabled={busy}
                      onClick={() => void deletePhoto(photo.id)}
                      type="button"
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.dialogActions}>
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
        )}

        {error ? (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

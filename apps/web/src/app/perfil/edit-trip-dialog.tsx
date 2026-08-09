"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import type { OwnerExperienceListItem } from "@/lib/experiences/load-owner-experiences";
import { deleteLocalPhotoBlobs } from "@/lib/local-photos/photo-blob-store";
import {
  clearCardPreviewPrefs,
  getCardPreviewPrefs,
  setCardPreviewPrefs,
} from "@/lib/profile/card-preview-prefs";

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

export function EditTripDialog({
  experience,
  onClose,
}: {
  readonly experience: OwnerExperienceListItem;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<DialogTab>("card");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<readonly PhotoOption[]>([]);
  const [albums, setAlbums] = useState<readonly AlbumOption[]>([]);
  const [coverPhotoId, setCoverPhotoId] = useState(experience.coverPhotoId);
  const [previewIds, setPreviewIds] = useState<readonly string[]>(() => {
    const saved = getCardPreviewPrefs(experience.id);
    if (saved?.previewPhotoIds.length) return [...saved.previewPhotoIds];
    return [...experience.previewPhotoIds].slice(0, 4);
  });

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

  function togglePreview(photoId: string) {
    setPreviewIds((current) => {
      if (current.includes(photoId)) {
        return current.filter((id) => id !== photoId);
      }
      if (current.length >= 4) {
        return [...current.slice(1), photoId];
      }
      return [...current, photoId];
    });
  }

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
      setCardPreviewPrefs(experience.id, { previewPhotoIds: previewIds });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
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
      setPreviewIds((current) => current.filter((id) => id !== photoId));
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
        setPreviewIds((current) => current.filter((id) => !removed.has(id)));
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
              <>
                <fieldset className={styles.coverPicker}>
                  <legend>Foto de capa do card</legend>
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

                <fieldset className={styles.coverPicker}>
                  <legend>Até 4 fotos do strip ({previewIds.length}/4)</legend>
                  <p className={styles.fieldHint}>
                    Toque para marcar/desmarcar. A ordem é a ordem em que você
                    escolhe.
                  </p>
                  <div className={styles.coverChoices}>
                    {photos.map((photo) => {
                      const index = previewIds.indexOf(photo.id);
                      const selected = index >= 0;
                      return (
                        <button
                          aria-pressed={selected}
                          className={styles.coverChoice}
                          data-selected={selected ? "true" : "false"}
                          key={`strip-${photo.id}`}
                          onClick={() => togglePreview(photo.id)}
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
                          {selected ? (
                            <span className={styles.choiceBadge}>
                              {index + 1}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </>
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

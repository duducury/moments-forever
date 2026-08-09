"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
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

type DialogTab = "card" | "delete";

export function EditPlaceDialog({
  place,
  onClose,
}: {
  readonly place: OwnerPlaceCardItem;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<DialogTab>("card");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<readonly PhotoOption[]>([]);
  const [name, setName] = useState(place.title);
  const [coverPhotoId, setCoverPhotoId] = useState(place.coverPhotoId);
  const [previewIds, setPreviewIds] = useState<readonly string[]>(() => {
    const saved = getCardPreviewPrefs(place.albumId);
    if (saved?.previewPhotoIds.length) return [...saved.previewPhotoIds];
    return [...place.previewPhotoIds].slice(0, 4);
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/experiences/${place.experienceId}/photos`,
        );
        const payload = (await response.json()) as {
          readonly photos?: readonly PhotoOption[];
          readonly error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Falha ao carregar fotos.");
        }
        if (!cancelled) {
          setPhotos(
            (payload.photos ?? []).filter(
              (photo) => photo.album_id === place.albumId,
            ),
          );
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
  }, [place.albumId, place.experienceId]);

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

  async function onSaveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setError("Informe um nome.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/albums/${place.albumId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          cover_photo_id: coverPhotoId,
        }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível salvar.");
      }
      setCardPreviewPrefs(place.albumId, { previewPhotoIds: previewIds });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePlace() {
    if (
      !window.confirm(
        `Excluir a viagem “${place.title}”${
          place.photoCount > 0
            ? ` e suas ${place.photoCount} foto${place.photoCount === 1 ? "" : "s"}`
            : ""
        }?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/albums/${place.albumId}${place.photoCount > 0 ? "?force=1" : ""}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        readonly error?: string;
        readonly deleted_photo_ids?: readonly string[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível excluir.");
      }
      const deletedIds = payload.deleted_photo_ids ?? [];
      if (deletedIds.length > 0) {
        await deleteLocalPhotoBlobs([...deletedIds]);
      }
      clearCardPreviewPrefs(place.albumId);
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }

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
        <p className={styles.fieldHint}>{place.title}</p>

        <div className={styles.dialogTabs} role="tablist">
          <button
            aria-selected={tab === "card"}
            className={styles.dialogTab}
            data-active={tab === "card" ? "true" : "false"}
            onClick={() => setTab("card")}
            role="tab"
            type="button"
          >
            Card
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
          <form
            className={styles.dialogForm}
            onSubmit={(event) => void onSaveCard(event)}
          >
            <label htmlFor="place-name">Nome</label>
            <input
              id="place-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />

            {loading ? (
              <p className={styles.fieldHint}>Carregando fotos…</p>
            ) : (
              <>
                <fieldset className={styles.coverPicker}>
                  <legend>Foto de capa</legend>
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
                          title={place.title}
                          variant="thumbnail"
                        />
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className={styles.coverPicker}>
                  <legend>
                    Até 4 fotos do strip ({previewIds.length}/4)
                  </legend>
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
                            title={place.title}
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
              Exclui a viagem e as fotos dela no servidor e neste dispositivo.
              Não dá para desfazer.
            </p>
            <div className={styles.dialogActions}>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void deletePlace()}
                type="button"
              >
                Excluir viagem
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

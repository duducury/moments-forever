"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { deleteLocalPhotoBlob } from "@/lib/local-photos/photo-blob-store";
import { useProgressiveLocalPhoto } from "@/lib/local-photos/use-progressive-local-photo";
import { boundsFromGeoPoints } from "@/lib/map/cluster-photos";
import {
  confirmRemovePhotoLocation,
  removeLocationFromPhotos,
} from "@/lib/privacy/remove-location";

import { SeeAlsoPlaces } from "@/app/perfil/see-also-places";
import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";

import { AddPhotosPanel } from "../../add-photos-panel";
import {
  AlbumGrid,
  LibraryShell,
  NameDialog,
  PhotoGallery,
  PhotoLightbox,
} from "../../album-ui";
import {
  buildBreadcrumb,
  formatPhotoPeriod,
  gpsCenter,
  photosWithGps,
  sortAlbumPhotos,
  toneFromId,
  type TripAlbum,
  type TripExperience,
  type TripPhoto,
} from "../../album-types";
import styles from "../../trip.module.css";
import { TripMap } from "../../trip-map";

interface Props {
  readonly experience: TripExperience;
  readonly albums: readonly TripAlbum[];
  readonly photos: readonly TripPhoto[];
  readonly albumId: string;
  readonly isOwner?: boolean;
  readonly relatedPlaces?: readonly OwnerPlaceCardItem[];
  /** Public profile home (/{nome}) for logo + breadcrumb. */
  readonly profileHomeHref?: string | null;
  /** Open this photo in the lightbox on mount (e.g. from Destaques). */
  readonly initialPhotoId?: string | null;
}

export function AlbumFolderView({
  experience,
  albums: initialAlbums,
  photos: initialPhotos,
  albumId,
  isOwner = false,
  relatedPlaces = [],
  profileHomeHref = null,
  initialPhotoId = null,
}: Props) {
  const router = useRouter();
  const [albums, setAlbums] = useState(initialAlbums);
  const [photos, setPhotos] = useState(initialPhotos);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [organizePhotos, setOrganizePhotos] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [addPhotosOpen, setAddPhotosOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [moveTargetId, setMoveTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(() => {
    if (!initialPhotoId) return null;
    const inAlbum = initialPhotos.some(
      (photo) => photo.id === initialPhotoId && photo.albumId === albumId,
    );
    return inAlbum ? initialPhotoId : null;
  });
  const [albumsSyncKey, setAlbumsSyncKey] = useState(initialAlbums);
  const [photosSyncKey, setPhotosSyncKey] = useState(initialPhotos);

  if (initialAlbums !== albumsSyncKey) {
    setAlbumsSyncKey(initialAlbums);
    setAlbums(initialAlbums);
  }
  if (initialPhotos !== photosSyncKey) {
    setPhotosSyncKey(initialPhotos);
    setPhotos(initialPhotos);
  }

  const album = albums.find((item) => item.id === albumId) ?? null;

  const breadcrumb = useMemo(
    () =>
      buildBreadcrumb(experience, albums, albumId, {
        isOwner,
        profileHomeHref,
      }),
    [albumId, albums, experience, isOwner, profileHomeHref],
  );
  const profileHref = profileHomeHref?.trim() || "/perfil";

  const albumPhotos = useMemo(
    () => photos.filter((photo) => photo.albumId === albumId),
    [albumId, photos],
  );

  const carouselPhotos = useMemo(
    () => sortAlbumPhotos(albumPhotos, album?.coverPhotoId ?? null),
    [album?.coverPhotoId, albumPhotos],
  );

  const period = useMemo(
    () => formatPhotoPeriod(albumPhotos),
    [albumPhotos],
  );

  const placeGpsCount = useMemo(
    () => photosWithGps(albumPhotos).length,
    [albumPhotos],
  );

  const placeMapFocus = useMemo(() => {
    const located = photosWithGps(albumPhotos);
    const center = gpsCenter(albumPhotos);
    if (!center || located.length === 0) return null;
    const bounds = boundsFromGeoPoints(
      located.map((photo) => ({
        id: photo.id,
        latitude: photo.exactLatitude as number,
        longitude: photo.exactLongitude as number,
        data: photo,
      })),
    );
    if (!bounds) return null;
    return {
      latitude: center.latitude,
      longitude: center.longitude,
      bounds,
    };
  }, [albumPhotos]);

  const childAlbums = useMemo(
    () => albums.filter((item) => item.parentAlbumId === albumId),
    [albumId, albums],
  );

  const otherAlbums = useMemo(
    () => albums.filter((item) => item.id !== albumId),
    [albumId, albums],
  );

  const photoCountLabel = `${albumPhotos.length} foto${
    albumPhotos.length === 1 ? "" : "s"
  }`;

  const metaLine = [period, photoCountLabel].filter(Boolean).join(" · ");

  function toggleSelected(photoId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  async function renameAlbum(name: string) {
    if (!album) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/albums/${album.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as {
        readonly album?: { readonly id: string; readonly name: string };
        readonly error?: string;
      };
      if (!response.ok || !payload.album) {
        throw new Error(payload.error ?? "Não foi possível renomear.");
      }
      const nextName = payload.album.name;
      setAlbums((current) =>
        current.map((item) =>
          item.id === payload.album!.id
            ? {
                ...item,
                name: nextName,
                displayName: nextName,
                placeName: item.placeId ? nextName : item.placeName,
                placeConfirmedByUser: item.placeId
                  ? true
                  : item.placeConfirmedByUser,
              }
            : item,
        ),
      );
      setRenameOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao renomear.");
    } finally {
      setBusy(false);
    }
  }

  async function setAlbumCover(photoId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ set_as_cover: "album" }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível definir a capa.");
      }
      setAlbums((current) =>
        current.map((item) =>
          item.id === albumId ? { ...item, coverPhotoId: photoId } : item,
        ),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao definir capa.");
    } finally {
      setBusy(false);
    }
  }

  async function moveSelected() {
    if (!moveTargetId || selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const photoId of selectedIds) {
        const response = await fetch(`/api/photos/${photoId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ album_id: moveTargetId }),
        });
        const payload = (await response.json()) as { readonly error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Não foi possível mover a foto.");
        }
      }
      setPhotos((current) =>
        current.map((photo) =>
          selectedIds.has(photo.id)
            ? { ...photo, albumId: moveTargetId }
            : photo,
        ),
      );
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao mover fotos.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (
      !window.confirm(
        `Excluir ${selectedIds.size} foto${selectedIds.size === 1 ? "" : "s"}? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const photoId of selectedIds) {
        const response = await fetch(`/api/photos/${photoId}`, {
          method: "DELETE",
        });
        const payload = (await response.json()) as { readonly error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Não foi possível excluir a foto.");
        }
        await deleteLocalPhotoBlob(photoId);
      }
      setPhotos((current) =>
        current.filter((photo) => !selectedIds.has(photo.id)),
      );
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir fotos.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLocationSelected() {
    if (selectedIds.size === 0) return;
    if (!confirmRemovePhotoLocation(selectedIds.size)) return;
    setBusy(true);
    setError(null);
    try {
      const ids = [...selectedIds];
      await removeLocationFromPhotos(ids);
      const cleared = new Set(ids);
      setPhotos((current) =>
        current.map((photo) =>
          cleared.has(photo.id)
            ? { ...photo, exactLatitude: null, exactLongitude: null }
            : photo,
        ),
      );
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao remover localização.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reorderPhoto(photoId: string, direction: "up" | "down") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reorder: direction }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível reordenar.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reordenar.");
    } finally {
      setBusy(false);
    }
  }

  if (!album) {
    return (
      <div className={styles.page}>
        <p className={styles.collapsedHint}>Lugar não encontrado.</p>
        <Link className="button secondary" href={profileHref}>
          Voltar ao perfil
        </Link>
      </div>
    );
  }

  return (
    <LibraryShell
      breadcrumb={breadcrumb}
      className={`${styles.page} ${styles.albumPage}`}
      header={
        <header className={styles.albumHeroHeader}>
          <div className={styles.albumHeroCopy}>
            <h1 className={styles.albumHeroTitle}>{album.displayName}</h1>
            {experience.primaryCountry ? (
              <p className={styles.albumHeroCountry}>
                {experience.primaryCountry}
              </p>
            ) : null}
            <p className={styles.albumHeroMeta}>{metaLine}</p>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </div>
          {isOwner ? (
            <div className={styles.albumHeroActions}>
              <button
                className={styles.quietAction}
                onClick={() => {
                  setError(null);
                  setAddPhotosOpen(true);
                }}
                type="button"
              >
                + Adicionar fotos
              </button>
              <button
                className={styles.quietAction}
                onClick={() => {
                  setError(null);
                  setRenameOpen(true);
                }}
                type="button"
              >
                Renomear
              </button>
              <button
                aria-expanded={organizePhotos}
                className={styles.quietAction}
                onClick={() => {
                  setOrganizePhotos((value) => !value);
                  setSelectedIds(new Set());
                  setError(null);
                }}
                type="button"
              >
                {organizePhotos ? "Concluir fotos" : "Organizar fotos"}
              </button>
              <button
                aria-expanded={foldersOpen}
                className={styles.quietAction}
                onClick={() => setFoldersOpen((value) => !value)}
                type="button"
              >
                {foldersOpen ? "Ocultar pastas" : "Subálbuns"}
              </button>
            </div>
          ) : null}
        </header>
      }
    >
      <div className={styles.albumStory}>
        {placeGpsCount > 0 ? (
          <section
            aria-label="Mapa do lugar"
            className={styles.albumMapSection}
          >
            <TripMap
              currentAlbumId={albumId}
              emptyHint="Fotos sem GPS continuam na galeria abaixo."
              emptyTitle="Não encontramos localizações nas fotos deste lugar."
              experienceSlug={experience.slug}
              focus={placeMapFocus}
              initialFit="focus"
              photos={albumPhotos}
              variant="featured"
            />
          </section>
        ) : null}

        <section
          aria-label="Informações do local"
          className={styles.albumInfoSection}
        >
          <h2 className={styles.albumInfoTitle}>{album.displayName}</h2>
          {experience.primaryCountry ? (
            <p className={styles.albumInfoCountry}>
              {experience.primaryCountry}
            </p>
          ) : null}
          <p className={styles.albumInfoLine}>{photoCountLabel}</p>
          {period ? <p className={styles.albumInfoLine}>{period}</p> : null}
          {experience.primaryCity &&
          experience.primaryCity !== album.displayName ? (
            <p className={styles.albumInfoLine}>{experience.primaryCity}</p>
          ) : null}
          {album.description ? (
            <p className={styles.albumInfoDescription}>{album.description}</p>
          ) : null}
        </section>

        {foldersOpen || childAlbums.length > 0 ? (
          <div
            className={styles.albumOrganize}
            data-open={foldersOpen || !isOwner ? "true" : "false"}
          >
            {foldersOpen || !isOwner ? (
              <AlbumGrid
                albums={albums}
                createLabel="+ Novo subálbum"
                experienceId={experience.id}
                experienceSlug={experience.slug}
                isOwner={isOwner}
                onAlbumsChange={setAlbums}
                parentAlbumId={albumId}
                photos={photos}
                primaryCountry={experience.primaryCountry}
                sectionHint="Subpastas opcionais dentro deste lugar."
                sectionTitle="Subálbuns"
              />
            ) : (
              <section aria-label="Subálbuns" className={styles.albumSection}>
                <div className={styles.albumSectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>Subálbuns</h2>
                    <p className={styles.sectionHint}>
                      {childAlbums.length} subálbum
                      {childAlbums.length === 1 ? "" : "s"} neste local.
                    </p>
                  </div>
                  <button
                    className={styles.quietAction}
                    onClick={() => setFoldersOpen(true)}
                    type="button"
                  >
                    Gerenciar
                  </button>
                </div>
              </section>
            )}
          </div>
        ) : null}

        <section
          aria-label="Fotos do álbum"
          className={styles.albumPhotosSection}
        >
          <div className={styles.albumSectionHeader}>
            <h2 className={styles.sectionTitle}>Fotos</h2>
          </div>

          {organizePhotos ? (
            <div className={styles.photoOrganizeBar}>
              <p className={styles.sectionHint}>
                {selectedIds.size} selecionada
                {selectedIds.size === 1 ? "" : "s"}
              </p>
              <div className={styles.actions}>
                <select
                  aria-label="Mover para lugar"
                  disabled={busy || otherAlbums.length === 0}
                  onChange={(event) => setMoveTargetId(event.target.value)}
                  value={moveTargetId}
                >
                  <option value="">Mover para…</option>
                  {otherAlbums.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName}
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  disabled={busy || !moveTargetId || selectedIds.size === 0}
                  onClick={() => void moveSelected()}
                  type="button"
                >
                  Mover
                </button>
                <button
                  className="button secondary"
                  disabled={busy || selectedIds.size !== 1}
                  onClick={() => {
                    const [only] = [...selectedIds];
                    if (only) void setAlbumCover(only);
                  }}
                  type="button"
                >
                  Trocar capa
                </button>
                <button
                  className="button secondary"
                  disabled={busy || selectedIds.size === 0}
                  onClick={() => void deleteSelected()}
                  type="button"
                >
                  Excluir
                </button>
                <button
                  className="button secondary"
                  disabled={busy || selectedIds.size === 0}
                  onClick={() => void removeLocationSelected()}
                  type="button"
                >
                  Remover localização
                </button>
              </div>
            </div>
          ) : null}

          {organizePhotos ? (
            <div className={styles.squareGrid}>
              {carouselPhotos.map((photo, index) => {
                const selected = selectedIds.has(photo.id);
                return (
                  <div className={styles.photoOrganizeTile} key={photo.id}>
                    <button
                      aria-pressed={selected}
                      className={styles.tileButton}
                      data-selected={selected ? "true" : "false"}
                      onClick={() => toggleSelected(photo.id)}
                      type="button"
                    >
                      <OrganizeThumb photo={photo} />
                    </button>
                    <div className={styles.photoOrganizeControls}>
                      <button
                        className="button secondary"
                        disabled={busy || index === 0}
                        onClick={() => void reorderPhoto(photo.id, "up")}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy || index === carouselPhotos.length - 1}
                        onClick={() => void reorderPhoto(photo.id, "down")}
                        type="button"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <PhotoGallery
              emptyLabel="Este lugar ainda não tem fotos."
              layout="square"
              onOpenPhoto={setLightboxId}
              photos={carouselPhotos}
            />
          )}
        </section>
      </div>

      <SeeAlsoPlaces places={relatedPlaces} />

      {lightboxId ? (
        <PhotoLightbox
          onClose={() => setLightboxId(null)}
          onSelect={setLightboxId}
          photoId={lightboxId}
          photos={carouselPhotos}
        />
      ) : null}

      {renameOpen ? (
        <NameDialog
          busy={busy}
          confirmLabel="Salvar"
          error={error}
          initialName={album.displayName}
          onClose={() => setRenameOpen(false)}
          onSubmit={renameAlbum}
          title="Renomear"
        />
      ) : null}

      {addPhotosOpen ? (
        <AddPhotosPanel
          albums={albums}
          defaultAlbumId={albumId}
          experienceId={experience.id}
          onClose={() => setAddPhotosOpen(false)}
        />
      ) : null}
    </LibraryShell>
  );
}

function OrganizeThumb({ photo }: { readonly photo: TripPhoto }) {
  const { nodeRef, thumbSrc, fullSrc } = useProgressiveLocalPhoto(photo.id);
  const hasImage = Boolean(thumbSrc || fullSrc);
  return (
    <span
      className={styles.squareTile}
      data-has-image={hasImage ? "true" : "false"}
      data-tone={toneFromId(photo.id)}
      ref={nodeRef}
    >
      {thumbSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={styles.tileImage}
          decoding="async"
          loading="lazy"
          src={thumbSrc}
        />
      ) : null}
      {fullSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={`${styles.tileImage} ${styles.tileImageFull}`}
          decoding="async"
          src={fullSrc}
        />
      ) : null}
    </span>
  );
}

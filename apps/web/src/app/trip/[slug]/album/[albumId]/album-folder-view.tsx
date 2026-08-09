"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  countryCodeFromName,
  countryCodeFromPlaceLabel,
} from "@moments-forever/shared";

import {
  deleteLocalPhotoBlob,
  deleteLocalPhotoBlobs,
} from "@/lib/local-photos/photo-blob-store";
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
  type TripAlbum,
  type TripExperience,
  type TripPhoto,
} from "../../album-types";
import styles from "../../trip.module.css";
import { TripMap } from "../../trip-map";
import { PhotoOrganizeGrid } from "./photo-organize-grid";

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
  /** Start in selection mode to remove GPS (from /privacidade). */
  readonly initialPrivacyMode?: boolean;
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
  initialPrivacyMode = false,
}: Props) {
  const router = useRouter();
  const [albums, setAlbums] = useState(initialAlbums);
  const [photos, setPhotos] = useState(initialPhotos);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [organizePhotos, setOrganizePhotos] = useState(
    () => Boolean(initialPrivacyMode && isOwner),
  );
  const [privacyPickMode, setPrivacyPickMode] = useState(
    () => Boolean(initialPrivacyMode && isOwner),
  );
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

  const countryCode = useMemo(() => {
    const fromCountry = countryCodeFromName(experience.primaryCountry ?? "");
    if (fromCountry) return fromCountry;
    const fromPlace = countryCodeFromPlaceLabel(album?.displayName ?? "");
    if (fromPlace) return fromPlace;
    const combined = [experience.primaryCountry, album?.displayName]
      .filter(Boolean)
      .join(", ");
    return countryCodeFromPlaceLabel(combined);
  }, [album?.displayName, experience.primaryCountry]);

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

  async function deleteCurrentAlbum() {
    if (!album) return;
    const force = albumPhotos.length > 0 || childAlbums.length > 0;
    const message = force
      ? `Excluir “${album.displayName}” e todas as fotos/subálbuns? Não dá para desfazer.`
      : `Excluir o lugar “${album.displayName}”?`;
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
        throw new Error(payload.error ?? "Não foi possível excluir o lugar.");
      }
      const deletedIds = payload.deleted_photo_ids ?? [];
      if (deletedIds.length > 0) {
        await deleteLocalPhotoBlobs([...deletedIds]);
      }
      router.push(profileHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir lugar.");
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
            ? {
                ...photo,
                exactLatitude: null,
                exactLongitude: null,
                locationLabel: null,
              }
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

  async function removeLocationFromPhoto(photoId: string) {
    if (!confirmRemovePhotoLocation(1)) return;
    setBusy(true);
    setError(null);
    try {
      await removeLocationFromPhotos([photoId]);
      setPhotos((current) =>
        current.map((photo) =>
          photo.id === photoId
            ? {
                ...photo,
                exactLatitude: null,
                exactLongitude: null,
                locationLabel: null,
              }
            : photo,
        ),
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao remover localização.",
      );
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
            <div className={styles.albumHeroTitleRow}>
              {countryCode ? (
                // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
                <img
                  alt=""
                  className={styles.albumHeroFlag}
                  decoding="async"
                  height={22}
                  src={`https://flagcdn.com/w80/${countryCode.toLowerCase()}.png`}
                  width={30}
                />
              ) : null}
              <h1 className={styles.albumHeroTitle}>{album.displayName}</h1>
            </div>
            {experience.primaryCountry ? (
              <p className={styles.albumHeroCountry}>
                {experience.primaryCountry}
              </p>
            ) : null}
            {metaLine ? (
              <p className={styles.albumHeroMeta}>{metaLine}</p>
            ) : null}
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </div>
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
              albumLabel={album.displayName}
              currentAlbumId={albumId}
              emptyHint="Fotos sem GPS continuam na galeria abaixo."
              emptyTitle="Não encontramos localizações nas fotos deste lugar."
              experienceSlug={experience.slug}
              experienceTitle={experience.title}
              focus={placeMapFocus}
              initialFit="focus"
              photos={albumPhotos}
              variant="featured"
            />
          </section>
        ) : null}

        {isOwner ? (
          <div className={styles.albumToolbar} aria-label="Ações do lugar">
            <button
              className={`${styles.albumToolButton} ${styles.albumToolPrimary}`}
              onClick={() => {
                setError(null);
                setAddPhotosOpen(true);
              }}
              type="button"
            >
              + Adicionar fotos
            </button>
            <button
              className={styles.albumToolButton}
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
              className={styles.albumToolButton}
              data-active={organizePhotos ? "true" : "false"}
              onClick={() => {
                setOrganizePhotos((value) => !value);
                setPrivacyPickMode(false);
                setSelectedIds(new Set());
                setError(null);
              }}
              type="button"
            >
              {organizePhotos ? "Concluir fotos" : "Organizar"}
            </button>
            <button
              className={styles.albumToolButton}
              data-active={privacyPickMode ? "true" : "false"}
              onClick={() => {
                setPrivacyPickMode(true);
                setOrganizePhotos(true);
                setSelectedIds(new Set());
                setError(null);
              }}
              type="button"
            >
              Privacidade
            </button>
            <button
              aria-expanded={foldersOpen}
              className={styles.albumToolButton}
              data-active={foldersOpen ? "true" : "false"}
              onClick={() => setFoldersOpen((value) => !value)}
              type="button"
            >
              {foldersOpen ? "Ocultar pastas" : "Subálbuns"}
            </button>
            <button
              className={`${styles.albumToolButton} ${styles.albumToolDanger}`}
              disabled={busy}
              onClick={() => void deleteCurrentAlbum()}
              type="button"
            >
              Excluir lugar
            </button>
          </div>
        ) : null}

        {album.description ||
        (experience.primaryCity &&
          experience.primaryCity !== album.displayName) ? (
          <section
            aria-label="Sobre o lugar"
            className={styles.albumInfoSection}
          >
            {experience.primaryCity &&
            experience.primaryCity !== album.displayName ? (
              <p className={styles.albumInfoLine}>{experience.primaryCity}</p>
            ) : null}
            {album.description ? (
              <p className={styles.albumInfoDescription}>{album.description}</p>
            ) : null}
          </section>
        ) : null}

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

          {privacyPickMode ? (
            <div className={styles.privacyPickBanner} role="status">
              <p>
                Selecione as fotos com localização que deseja limpar, depois
                toque em <strong>Remover localização</strong>.
              </p>
              <button
                className={styles.quietAction}
                onClick={() => {
                  setPrivacyPickMode(false);
                  setOrganizePhotos(false);
                  setSelectedIds(new Set());
                }}
                type="button"
              >
                Sair da seleção
              </button>
            </div>
          ) : null}

          {organizePhotos ? (
            <div className={styles.photoOrganizeBar}>
              <p className={styles.sectionHint}>
                {selectedIds.size} selecionada
                {selectedIds.size === 1 ? "" : "s"}
                {" · Arraste para reordenar · toque para selecionar"}
                {privacyPickMode
                  ? ` · ${
                      carouselPhotos.filter(
                        (photo) =>
                          photo.exactLatitude !== null &&
                          photo.exactLongitude !== null,
                      ).length
                    } com GPS neste lugar`
                  : ""}
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
                  className={
                    privacyPickMode ? "button primary" : "button secondary"
                  }
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
            <PhotoOrganizeGrid
              albumId={albumId}
              busy={busy}
              onBusyChange={setBusy}
              onError={setError}
              onOrderChange={(ordered) => {
                const positions = new Map(
                  ordered.map((photo, index) => [photo.id, index + 1]),
                );
                setPhotos((current) =>
                  current.map((photo) => {
                    const nextPos = positions.get(photo.id);
                    if (nextPos === undefined) return photo;
                    return { ...photo, positionInAlbum: nextPos };
                  }),
                );
                router.refresh();
              }}
              onToggleSelected={toggleSelected}
              photos={albumPhotos}
              selectedIds={selectedIds}
            />
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
          albumLabel={album.displayName}
          canRemoveLocation={isOwner}
          experienceTitle={experience.title}
          onClose={() => setLightboxId(null)}
          onRemoveLocation={
            isOwner ? (photoId) => removeLocationFromPhoto(photoId) : undefined
          }
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { AppWordmark } from "@/components/app-wordmark";
import { deleteLocalPhotoBlobs } from "@/lib/local-photos/photo-blob-store";
import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";

import {
  buildAlbumCards,
  toneFromId,
  type AlbumCardModel,
  type BreadcrumbItem,
  type TripAlbum,
  type TripPhoto,
} from "./album-types";
import { LightboxZoomStage } from "./lightbox-zoom-stage";
import styles from "./trip.module.css";

function formatLightboxCapturedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const includeTime = /T\d{2}:\d{2}/u.test(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

/** Instagram-style dots — window around the active photo when the album is long. */
function LightboxDots({
  count,
  index,
  onSelectIndex,
}: {
  readonly count: number;
  readonly index: number;
  readonly onSelectIndex: (nextIndex: number) => void;
}) {
  if (count < 2) return null;

  const maxVisible = 15;
  let start = 0;
  let end = count;
  if (count > maxVisible) {
    const half = Math.floor(maxVisible / 2);
    start = Math.max(0, Math.min(index - half, count - maxVisible));
    end = start + maxVisible;
  }

  const dots = [];
  for (let i = start; i < end; i += 1) {
    dots.push(i);
  }

  return (
    <div
      aria-label={`Foto ${index + 1} de ${count}`}
      className={styles.lightboxDots}
      role="tablist"
    >
      {dots.map((dotIndex) => (
        <button
          aria-current={dotIndex === index ? "true" : undefined}
          aria-label={`Ir para foto ${dotIndex + 1}`}
          className={styles.lightboxDot}
          data-active={dotIndex === index ? "true" : "false"}
          key={dotIndex}
          onClick={() => onSelectIndex(dotIndex)}
          role="tab"
          type="button"
        />
      ))}
    </div>
  );
}

function AlbumCover({ photoId }: { readonly photoId: string | null }) {
  const src = useLocalPhotoObjectUrl(photoId, "thumbnail");
  return (
    <span
      className={styles.albumCover}
      data-has-image={src ? "true" : "false"}
      data-tone={photoId ? toneFromId(photoId) : "0"}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className={styles.albumCoverImage} decoding="async" src={src} />
      ) : null}
    </span>
  );
}

function ProgressiveTileMedia({
  photoId,
  className,
}: {
  readonly photoId: string;
  readonly className: string;
}) {
  // Grids stay on thumbnail only — preview/full is for lightbox and covers.
  const thumbSrc = useLocalPhotoObjectUrl(photoId, "thumbnail");
  const hasImage = Boolean(thumbSrc);

  return (
    <span
      className={className}
      data-has-image={hasImage ? "true" : "false"}
      data-tone={toneFromId(photoId)}
    >
      {thumbSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={styles.tileImage}
          decoding="async"
          draggable={false}
          loading="lazy"
          src={thumbSrc}
        />
      ) : null}
    </span>
  );
}

function PhotoTile({
  photo,
  onOpen,
}: {
  readonly photo: TripPhoto;
  readonly onOpen: () => void;
}) {
  const order = photo.positionInAlbum ?? photo.positionInMoment;
  return (
    <button
      aria-label={`Abrir foto ${order}`}
      className={styles.tileButton}
      onClick={onOpen}
      type="button"
    >
      <ProgressiveTileMedia className={styles.squareTile} photoId={photo.id} />
    </button>
  );
}

export function PhotoLightbox({
  photos,
  photoId,
  onClose,
  onSelect,
  experienceTitle = null,
  albumLabel = null,
  canRemoveLocation = false,
  onRemoveLocation,
  canDelete = false,
  onDelete,
}: {
  readonly photos: readonly TripPhoto[];
  readonly photoId: string;
  readonly onClose: () => void;
  readonly onSelect: (photoId: string) => void;
  readonly experienceTitle?: string | null;
  readonly albumLabel?: string | null;
  readonly canRemoveLocation?: boolean;
  readonly onRemoveLocation?: (photoId: string) => void | Promise<void>;
  readonly canDelete?: boolean;
  readonly onDelete?: (photoId: string) => void | Promise<void>;
}) {
  const index = photos.findIndex((photo) => photo.id === photoId);
  const photo = index >= 0 ? photos[index] : null;
  const neighborPrevId =
    photos.length > 1 && index >= 0
      ? photos[(index - 1 + photos.length) % photos.length]?.id
      : null;
  const neighborNextId =
    photos.length > 1 && index >= 0
      ? photos[(index + 1) % photos.length]?.id
      : null;
  const thumbSrc = useLocalPhotoObjectUrl(photo?.id, "thumbnail");
  const fullSrc = useLocalPhotoObjectUrl(photo?.id, "full");
  // Prefetch ±1 neighbors so swipe feels instant (same idea as album carousel).
  useLocalPhotoObjectUrl(neighborPrevId, "full");
  useLocalPhotoObjectUrl(neighborNextId, "full");
  const [removingLocation, setRemovingLocation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dismissDragY, setDismissDragY] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setDismissDragY(0);
    setMenuOpen(false);
  }, [photoId]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(`.${styles.lightboxMenu}`)) return;
      setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (!photo || photos.length < 2) return;
      if (event.key === "ArrowRight") {
        const next = photos[(index + 1) % photos.length];
        if (next) onSelect(next.id);
      }
      if (event.key === "ArrowLeft") {
        const prev = photos[(index - 1 + photos.length) % photos.length];
        if (prev) onSelect(prev.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, onClose, onSelect, photo, photos]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!photo) return null;
  if (typeof document === "undefined") return null;

  const currentPhoto = photo;

  function go(delta: number) {
    if (photos.length < 2) return;
    const next = photos[(index + delta + photos.length) % photos.length];
    if (next) onSelect(next.id);
  }

  const capturedLabel = formatLightboxCapturedAt(currentPhoto.capturedAt);
  const placeLabel = currentPhoto.locationLabel?.trim() || null;
  const tripLabel = experienceTitle?.trim() || null;
  const folderLabel = albumLabel?.trim() || null;
  // Prefer the trip/place name so the bottom never looks empty.
  const locationHeadline =
    placeLabel || folderLabel || tripLabel || "Momento";
  const secondaryParts = [
    capturedLabel,
    placeLabel && folderLabel && placeLabel !== folderLabel ? folderLabel : null,
    tripLabel && tripLabel !== locationHeadline ? tripLabel : null,
    hasGpsHint(currentPhoto) ? "com localização" : null,
  ].filter((part): part is string => Boolean(part));
  const showRemoveLocation =
    canRemoveLocation && Boolean(onRemoveLocation) && hasGpsHint(currentPhoto);
  const showOwnerMenu =
    showRemoveLocation || (canDelete && Boolean(onDelete));

  async function handleRemoveLocation() {
    if (!onRemoveLocation || removingLocation || deleting) return;
    setMenuOpen(false);
    setRemovingLocation(true);
    try {
      await onRemoveLocation(currentPhoto.id);
    } finally {
      setRemovingLocation(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || deleting) return;
    setMenuOpen(false);
    if (
      !window.confirm(
        "Excluir esta foto? Esta ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete(currentPhoto.id);
    } finally {
      setDeleting(false);
    }
  }

  const dismissProgress = Math.min(1, Math.abs(dismissDragY) / 220);
  const lightboxOpacity = Math.max(0.28, 1 - dismissProgress * 0.72);

  const dialog = (
    <div
      aria-label="Visualização da foto"
      aria-modal="true"
      className={styles.lightbox}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      style={{
        background: `rgb(8 8 8 / ${0.96 * lightboxOpacity})`,
      }}
    >
      <header
        className={styles.lightboxTop}
        style={{ opacity: Math.max(0.2, 1 - dismissProgress) }}
      >
        <AppWordmark className={styles.lightboxBrand} />
        <div className={styles.lightboxTopActions}>
          {showOwnerMenu ? (
            <div className={styles.lightboxMenu}>
              <button
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Mais opções"
                className={styles.lightboxMenuButton}
                onClick={() => setMenuOpen((value) => !value)}
                type="button"
              >
                ⋯
              </button>
              {menuOpen ? (
                <div className={styles.lightboxMenuPanel} role="menu">
                  {showRemoveLocation ? (
                    <button
                      disabled={removingLocation || deleting}
                      onClick={() => void handleRemoveLocation()}
                      role="menuitem"
                      type="button"
                    >
                      {removingLocation
                        ? "Removendo…"
                        : "Remover localização"}
                    </button>
                  ) : null}
                  {canDelete && onDelete ? (
                    <button
                      data-danger="true"
                      disabled={deleting || removingLocation}
                      onClick={() => void handleDelete()}
                      role="menuitem"
                      type="button"
                    >
                      {deleting ? "Excluindo…" : "Excluir foto"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            aria-label="Fechar visualização"
            className={styles.lightboxClose}
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>
      </header>

      <div className={styles.lightboxStageWrap}>
        {photos.length > 1 ? (
          <button
            aria-label="Foto anterior"
            className={`${styles.lightboxArrow} ${styles.lightboxArrowPrev}`}
            onClick={() => go(-1)}
            style={{ opacity: Math.max(0.15, 0.72 * (1 - dismissProgress)) }}
            type="button"
          >
            ‹
          </button>
        ) : null}

        <LightboxZoomStage
          hasImage={Boolean(thumbSrc || fullSrc)}
          onDismiss={onClose}
          onDismissDrag={setDismissDragY}
          onSwipe={
            photos.length > 1
              ? (delta) => {
                  go(delta);
                }
              : undefined
          }
          photoId={currentPhoto.id}
          tone={toneFromId(currentPhoto.id)}
        >
          {thumbSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className={styles.lightboxImage}
              decoding="async"
              draggable={false}
              src={thumbSrc}
            />
          ) : null}
          {fullSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`Foto ${index + 1}`}
              className={`${styles.lightboxImage} ${styles.lightboxImageFull}`}
              decoding="async"
              draggable={false}
              src={fullSrc}
            />
          ) : null}
        </LightboxZoomStage>

        {photos.length > 1 ? (
          <button
            aria-label="Próxima foto"
            className={`${styles.lightboxArrow} ${styles.lightboxArrowNext}`}
            onClick={() => go(1)}
            style={{ opacity: Math.max(0.15, 0.72 * (1 - dismissProgress)) }}
            type="button"
          >
            ›
          </button>
        ) : null}
      </div>

      <div
        className={styles.lightboxMeta}
        style={{ opacity: Math.max(0.15, 1 - dismissProgress) }}
      >
        <LightboxDots
          count={photos.length}
          index={index}
          onSelectIndex={(nextIndex) => {
            const next = photos[nextIndex];
            if (next) onSelect(next.id);
          }}
        />
        <p className={styles.lightboxMetaLine}>{locationHeadline}</p>
        {secondaryParts.length > 0 ? (
          <p className={styles.lightboxMetaSecondary}>
            {secondaryParts.join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

function hasGpsHint(photo: TripPhoto): boolean {
  return (
    photo.exactLatitude !== null &&
    photo.exactLongitude !== null &&
    Number.isFinite(photo.exactLatitude) &&
    Number.isFinite(photo.exactLongitude)
  );
}

export function TripBreadcrumb({
  items,
}: {
  readonly items: readonly BreadcrumbItem[];
}) {
  return (
    <nav aria-label="Caminho" className={styles.breadcrumb}>
      {items.map((item, index) => (
        <span className={styles.breadcrumbItem} key={`${item.label}-${index}`}>
          {index > 0 ? (
            <span aria-hidden="true" className={styles.breadcrumbSep}>
              ›
            </span>
          ) : null}
          {item.href ? (
            <Link className="text-link" href={item.href}>
              {item.label}
            </Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function useLockPageScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      html.style.overflow = previous.htmlOverflow;
      html.style.overscrollBehavior = previous.htmlOverscroll;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

export function NameDialog({
  title,
  initialName,
  confirmLabel,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  readonly title: string;
  readonly initialName: string;
  readonly confirmLabel: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (name: string) => Promise<void>;
}) {
  useLockPageScroll();

  return (
    <div
      aria-label={title}
      aria-modal="true"
      className={styles.panel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className={styles.panelCard}>
        <h2>{title}</h2>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onSubmit(String(data.get("name") ?? ""));
          }}
        >
          <label htmlFor="album-name">Nome</label>
          <input
            autoFocus
            defaultValue={initialName}
            id="album-name"
            name="name"
            required
          />
          <div className={styles.panelActions}>
            <button className="button primary" disabled={busy} type="submit">
              {busy ? "Salvando…" : confirmLabel}
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
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </div>
    </div>
  );
}

export function StoryDialog({
  title,
  initialStory,
  confirmLabel,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  readonly title: string;
  readonly initialStory: string;
  readonly confirmLabel: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (story: string) => Promise<void>;
}) {
  useLockPageScroll();

  return (
    <div
      aria-label={title}
      aria-modal="true"
      className={styles.panel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className={`${styles.panelCard} ${styles.storyPanelCard}`}>
        <h2>{title}</h2>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onSubmit(String(data.get("story") ?? ""));
          }}
        >
          <label htmlFor="album-story">Sobre essa viagem</label>
          <textarea
            autoFocus
            className={`${styles.textarea} ${styles.storyTextarea}`}
            defaultValue={initialStory}
            id="album-story"
            maxLength={4000}
            name="story"
            placeholder="O que essa viagem significou para você?"
            rows={7}
          />
          <div className={styles.panelActions}>
            <button className="button primary" disabled={busy} type="submit">
              {busy ? "Salvando…" : confirmLabel}
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
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </div>
    </div>
  );
}

function albumFromCreatePayload(album: {
  readonly id: string;
  readonly experience_id: string;
  readonly parent_album_id: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly cover_photo_id: string | null;
  readonly position: number;
}): TripAlbum {
  return {
    id: album.id,
    experienceId: album.experience_id,
    parentAlbumId: album.parent_album_id,
    name: album.name,
    displayName: album.name,
    description: album.description,
    coverPhotoId: album.cover_photo_id,
    position: album.position,
    placeId: null,
    placeName: null,
    placeConfirmedByUser: false,
  };
}

export function AlbumGrid({
  experienceId,
  experienceSlug,
  albums,
  photos,
  parentAlbumId,
  createLabel,
  primaryCountry = null,
  sectionTitle = "Lugares",
  sectionHint = "Cada lugar é uma pasta dentro desta viagem.",
  onAddPhotos,
  onIdentifyPlaces,
  identifyBusy = false,
  onAlbumsChange,
  isOwner = false,
}: {
  readonly experienceId: string;
  readonly experienceSlug: string;
  readonly albums: readonly TripAlbum[];
  readonly photos: readonly TripPhoto[];
  readonly parentAlbumId: string | null;
  readonly createLabel: string;
  readonly primaryCountry?: string | null;
  readonly sectionTitle?: string;
  readonly sectionHint?: string;
  readonly onAddPhotos?: () => void;
  readonly onIdentifyPlaces?: () => void;
  readonly identifyBusy?: boolean;
  readonly onAlbumsChange: (albums: readonly TripAlbum[]) => void;
  readonly isOwner?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameAlbum, setRenameAlbum] = useState<AlbumCardModel | null>(null);

  const cards = useMemo(
    () => buildAlbumCards(albums, photos, parentAlbumId),
    [albums, parentAlbumId, photos],
  );

  async function createAlbum(name: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/experiences/${experienceId}/albums`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          parent_album_id: parentAlbumId,
        }),
      });
      const payload = (await response.json()) as {
        readonly album?: {
          readonly id: string;
          readonly experience_id: string;
          readonly parent_album_id: string | null;
          readonly name: string;
          readonly description: string | null;
          readonly cover_photo_id: string | null;
          readonly position: number;
        };
        readonly error?: string;
      };
      if (!response.ok || !payload.album) {
        throw new Error(payload.error ?? "Não foi possível criar o álbum.");
      }
      onAlbumsChange([...albums, albumFromCreatePayload(payload.album)]);
      setCreateOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar álbum.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(name: string) {
    if (!renameAlbum) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/albums/${renameAlbum.id}`, {
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
      onAlbumsChange(
        albums.map((album) =>
          album.id === payload.album!.id
            ? {
                ...album,
                name: nextName,
                displayName: nextName,
                placeName: album.placeId ? nextName : album.placeName,
                placeConfirmedByUser: album.placeId
                  ? true
                  : album.placeConfirmedByUser,
              }
            : album,
        ),
      );
      setRenameAlbum(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao renomear.");
    } finally {
      setBusy(false);
    }
  }

  async function reorder(albumId: string, direction: "up" | "down") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reorder: direction }),
      });
      const payload = (await response.json()) as {
        readonly album?: {
          readonly id: string;
          readonly position: number;
        };
        readonly error?: string;
      };
      if (!response.ok || !payload.album) {
        throw new Error(payload.error ?? "Não foi possível reordenar.");
      }

      const siblingIds = cards.map((card) => card.id);
      const index = siblingIds.indexOf(albumId);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || swapIndex < 0 || swapIndex >= siblingIds.length) {
        return;
      }
      const current = cards[index];
      const swapWith = cards[swapIndex];
      if (!current || !swapWith) return;

      onAlbumsChange(
        albums.map((album) => {
          if (album.id === current.id) {
            return { ...album, position: swapWith.position };
          }
          if (album.id === swapWith.id) {
            return { ...album, position: current.position };
          }
          return album;
        }),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reordenar.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAlbum(album: AlbumCardModel) {
    const force = album.photoCount > 0 || album.childCount > 0;
    const message = force
      ? `Excluir “${album.displayName}” e todas as fotos/subálbuns dentro? Não dá para desfazer.`
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
        throw new Error(payload.error ?? "Não foi possível excluir.");
      }
      const deletedIds = payload.deleted_photo_ids ?? [];
      if (deletedIds.length > 0) {
        await deleteLocalPhotoBlobs([...deletedIds]);
      }
      onAlbumsChange(albums.filter((item) => item.id !== album.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.albumSection} aria-label={sectionTitle}>
      <div className={styles.albumSectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{sectionTitle}</h2>
          <p className={styles.sectionHint}>{sectionHint}</p>
        </div>
        {isOwner ? (
          <div className={styles.actions}>
            {onIdentifyPlaces ? (
              <button
                className="button secondary"
                disabled={busy || identifyBusy}
                onClick={onIdentifyPlaces}
                type="button"
              >
                {identifyBusy ? "Identificando…" : "Identificar lugares"}
              </button>
            ) : null}
            {onAddPhotos ? (
              <button
                className="button secondary"
                disabled={busy || identifyBusy}
                onClick={onAddPhotos}
                type="button"
              >
                + Adicionar fotos
              </button>
            ) : null}
            <button
              className="button primary"
              disabled={busy || identifyBusy}
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
              type="button"
            >
              {createLabel}
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {cards.length === 0 ? (
        <p className={styles.collapsedHint}>
          {isOwner
            ? "Nenhum lugar aqui ainda. Crie o primeiro para organizar as fotos."
            : "Nenhum lugar nesta viagem."}
        </p>
      ) : (
        <div className={styles.albumGrid}>
          {cards.map((album, index) => (
            <article className={styles.albumCard} key={album.id}>
              <Link
                className={styles.albumCardLink}
                href={`/perfil/${encodeURIComponent(experienceSlug)}/album/${album.id}`}
              >
                <AlbumCover photoId={album.previewPhotoId} />
                <div className={styles.albumCardBody}>
                  <h3>{album.displayName}</h3>
                  {primaryCountry ? <p>{primaryCountry}</p> : null}
                  <p>
                    {album.photoCount} foto
                    {album.photoCount === 1 ? "" : "s"}
                  </p>
                  {album.periodLabel ? <p>{album.periodLabel}</p> : null}
                </div>
              </Link>
              {isOwner ? (
              <div className={styles.albumCardActions}>
                <button
                  className="button secondary"
                  disabled={busy || index === 0}
                  onClick={() => void reorder(album.id, "up")}
                  type="button"
                >
                  ↑
                </button>
                <button
                  className="button secondary"
                  disabled={busy || index === cards.length - 1}
                  onClick={() => void reorder(album.id, "down")}
                  type="button"
                >
                  ↓
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setRenameAlbum(album);
                  }}
                  type="button"
                >
                  Renomear
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void removeAlbum(album)}
                  type="button"
                >
                  Excluir
                </button>
              </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {isOwner && createOpen ? (
        <NameDialog
          busy={busy}
          confirmLabel="Criar"
          error={error}
          initialName=""
          onClose={() => setCreateOpen(false)}
          onSubmit={createAlbum}
          title={createLabel}
        />
      ) : null}

      {isOwner && renameAlbum ? (
        <NameDialog
          busy={busy}
          confirmLabel="Salvar"
          error={error}
          initialName={renameAlbum.displayName}
          onClose={() => setRenameAlbum(null)}
          onSubmit={rename}
          title="Renomear"
        />
      ) : null}
    </section>
  );
}

function SquarePhotoTile({
  photo,
  onOpen,
}: {
  readonly photo: TripPhoto;
  readonly onOpen: () => void;
}) {
  const order = photo.positionInAlbum ?? photo.positionInMoment;
  return (
    <button
      aria-label={`Abrir foto ${order}`}
      className={styles.tileButton}
      onClick={onOpen}
      type="button"
    >
      <ProgressiveTileMedia className={styles.squareTile} photoId={photo.id} />
    </button>
  );
}

export function PhotoGallery({
  photos,
  emptyLabel,
  layout = "square",
  onOpenPhoto,
}: {
  readonly photos: readonly TripPhoto[];
  readonly emptyLabel: string;
  readonly layout?: "natural" | "square";
  /** When set, parent owns the lightbox. */
  readonly onOpenPhoto?: (photoId: string) => void;
}) {
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const ordered = useMemo(
    () =>
      photos.slice().sort(
        (a, b) =>
          (a.positionInAlbum ?? a.positionInMoment) -
          (b.positionInAlbum ?? b.positionInMoment),
      ),
    [photos],
  );

  function openPhoto(photoId: string) {
    if (onOpenPhoto) {
      onOpenPhoto(photoId);
      return;
    }
    setLightboxId(photoId);
  }

  if (ordered.length === 0) {
    return <p className={styles.collapsedHint}>{emptyLabel}</p>;
  }

  return (
    <>
      <div
        className={
          layout === "square"
            ? `${styles.squareGrid} ${styles.squareGridInstagram}`
            : styles.grid
        }
      >
        {ordered.map((photo) =>
          layout === "square" ? (
            <SquarePhotoTile
              key={photo.id}
              onOpen={() => openPhoto(photo.id)}
              photo={photo}
            />
          ) : (
            <PhotoTile
              key={photo.id}
              onOpen={() => openPhoto(photo.id)}
              photo={photo}
            />
          ),
        )}
      </div>
      {!onOpenPhoto && lightboxId ? (
        <PhotoLightbox
          onClose={() => setLightboxId(null)}
          onSelect={setLightboxId}
          photoId={lightboxId}
          photos={ordered}
        />
      ) : null}
    </>
  );
}

export function LibraryShell({
  breadcrumb,
  header,
  children,
  className,
}: {
  readonly breadcrumb: readonly BreadcrumbItem[];
  readonly header: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={className ?? styles.page}>
      <TripBreadcrumb items={breadcrumb} />
      {header}
      {children}
    </div>
  );
}

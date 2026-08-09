"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useProgressiveLocalPhoto } from "@/lib/local-photos/use-progressive-local-photo";
import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";

import {
  buildAlbumCards,
  toneFromId,
  type AlbumCardModel,
  type BreadcrumbItem,
  type TripAlbum,
  type TripPhoto,
} from "./album-types";
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
  const { nodeRef, thumbSrc, fullSrc } = useProgressiveLocalPhoto(photoId);
  const hasImage = Boolean(thumbSrc || fullSrc);

  return (
    <span
      className={className}
      data-has-image={hasImage ? "true" : "false"}
      data-tone={toneFromId(photoId)}
      ref={nodeRef}
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
      {fullSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={`${styles.tileImage} ${styles.tileImageFull}`}
          decoding="async"
          draggable={false}
          src={fullSrc}
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
}: {
  readonly photos: readonly TripPhoto[];
  readonly photoId: string;
  readonly onClose: () => void;
  readonly onSelect: (photoId: string) => void;
  readonly experienceTitle?: string | null;
  readonly albumLabel?: string | null;
}) {
  const index = photos.findIndex((photo) => photo.id === photoId);
  const photo = index >= 0 ? photos[index] : null;
  const thumbSrc = useLocalPhotoObjectUrl(photo?.id, "thumbnail");
  const fullSrc = useLocalPhotoObjectUrl(photo?.id, "full");
  const touchStartX = useRef<number | null>(null);

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

  function go(delta: number) {
    if (photos.length < 2) return;
    const next = photos[(index + delta + photos.length) % photos.length];
    if (next) onSelect(next.id);
  }

  const capturedLabel = formatLightboxCapturedAt(photo.capturedAt);
  const placeLabel = photo.locationLabel?.trim() || null;
  const tripLabel = experienceTitle?.trim() || null;
  const folderLabel = albumLabel?.trim() || null;
  const secondaryParts = [capturedLabel, tripLabel, folderLabel].filter(
    (part): part is string => Boolean(part),
  );

  const dialog = (
    <div
      aria-label="Visualização da foto"
      aria-modal="true"
      className={styles.lightbox}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null || photos.length < 2) return;
        const delta = event.changedTouches[0]?.clientX ?? touchStartX.current;
        const distance = delta - touchStartX.current;
        touchStartX.current = null;
        if (distance <= -48) go(1);
        else if (distance >= 48) go(-1);
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      role="dialog"
    >
      <button
        aria-label="Fechar visualização"
        className={styles.lightboxClose}
        onClick={onClose}
        type="button"
      >
        ✕
      </button>

      {photos.length > 1 ? (
        <button
          aria-label="Foto anterior"
          className={`${styles.lightboxArrow} ${styles.lightboxArrowPrev}`}
          onClick={() => go(-1)}
          type="button"
        >
          ‹
        </button>
      ) : null}

      <div className={styles.lightboxStageWrap}>
        <div
          className={styles.lightboxStage}
          data-has-image={thumbSrc || fullSrc ? "true" : "false"}
          data-tone={toneFromId(photo.id)}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
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
        </div>
      </div>

      <div className={styles.lightboxMeta}>
        {placeLabel ? (
          <p className={styles.lightboxMetaLine}>{placeLabel}</p>
        ) : null}
        {secondaryParts.length > 0 ? (
          <p className={styles.lightboxMetaSecondary}>
            {secondaryParts.join(" · ")}
          </p>
        ) : null}
        <p className={styles.lightboxMetaCount}>
          {index + 1} / {photos.length}
        </p>
      </div>

      {photos.length > 1 ? (
        <button
          aria-label="Próxima foto"
          className={`${styles.lightboxArrow} ${styles.lightboxArrowNext}`}
          onClick={() => go(1)}
          type="button"
        >
          ›
        </button>
      ) : null}
    </div>
  );

  return createPortal(dialog, document.body);
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
    if (album.photoCount > 0 || album.childCount > 0) {
      setError(
        "Só é possível excluir lugares vazios. Mova ou exclua as fotos antes.",
      );
      return;
    }
    if (!window.confirm(`Excluir o lugar “${album.displayName}”?`)) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/albums/${album.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível excluir.");
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
                  disabled={
                    busy || album.photoCount > 0 || album.childCount > 0
                  }
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
      <div className={layout === "square" ? styles.squareGrid : styles.grid}>
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

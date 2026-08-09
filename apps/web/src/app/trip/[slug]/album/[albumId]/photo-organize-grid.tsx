"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useProgressiveLocalPhoto } from "@/lib/local-photos/use-progressive-local-photo";

import { toneFromId, type TripPhoto } from "../../album-types";
import styles from "../../trip.module.css";

const DRAG_THRESHOLD_PX = 10;

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

function sortByAlbumPosition(photos: readonly TripPhoto[]): TripPhoto[] {
  return photos.slice().sort(
    (a, b) =>
      (a.positionInAlbum ?? a.positionInMoment) -
      (b.positionInAlbum ?? b.positionInMoment),
  );
}

function movePhoto(
  list: readonly TripPhoto[],
  fromId: string,
  toId: string,
): TripPhoto[] {
  if (fromId === toId) return [...list];
  const from = list.findIndex((photo) => photo.id === fromId);
  const to = list.findIndex((photo) => photo.id === toId);
  if (from < 0 || to < 0) return [...list];
  const next = [...list];
  const [removed] = next.splice(from, 1);
  if (!removed) return [...list];
  next.splice(to, 0, removed);
  return next;
}

export function PhotoOrganizeGrid({
  albumId,
  photos,
  selectedIds,
  busy,
  onToggleSelected,
  onOrderChange,
  onError,
  onBusyChange,
}: {
  readonly albumId: string;
  readonly photos: readonly TripPhoto[];
  readonly selectedIds: ReadonlySet<string>;
  readonly busy: boolean;
  readonly onToggleSelected: (photoId: string) => void;
  /** Optimistic local positions after a successful save. */
  readonly onOrderChange: (ordered: readonly TripPhoto[]) => void;
  readonly onError: (message: string | null) => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const [items, setItems] = useState(() => sortByAlbumPosition(photos));
  const [dragId, setDragId] = useState<string | null>(null);
  const [htmlDragEnabled, setHtmlDragEnabled] = useState(true);
  const itemsRef = useRef(items);
  const dragIdRef = useRef<string | null>(null);
  const pointerRef = useRef<{
    photoId: string;
    startX: number;
    startY: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photosKey = photos.map((photo) => photo.id).join("|");

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    dragIdRef.current = dragId;
  }, [dragId]);

  useEffect(() => {
    // Sync from server when not mid-drag.
    if (dragIdRef.current) return;
    setItems(sortByAlbumPosition(photos));
  }, [photos, photosKey]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const sync = () => setHtmlDragEnabled(!media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  async function persistOrder(ordered: readonly TripPhoto[]) {
    onBusyChange(true);
    onError(null);
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          photo_order: ordered.map((photo) => photo.id),
        }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível reordenar.");
      }
      const withPositions = ordered.map((photo, index) => ({
        ...photo,
        positionInAlbum: index + 1,
      }));
      onOrderChange(withPositions);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao reordenar.");
      setItems(sortByAlbumPosition(photos));
    } finally {
      onBusyChange(false);
    }
  }

  function schedulePersist(ordered: readonly TripPhoto[]) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistOrder(ordered);
    }, 220);
  }

  function applyMove(fromId: string, toId: string) {
    if (fromId === toId) return;
    setItems((current) => {
      const next = movePhoto(current, fromId, toId);
      itemsRef.current = next;
      schedulePersist(next);
      return next;
    });
  }

  function onDragStart(photoId: string, event: ReactDragEvent) {
    if (busy) {
      event.preventDefault();
      return;
    }
    setDragId(photoId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", photoId);
  }

  function onDragOver(photoId: string, event: ReactDragEvent) {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (photoId !== dragId) {
      applyMove(dragId, photoId);
    }
  }

  function onDragEnd() {
    setDragId(null);
  }

  function onPointerDown(photoId: string, event: ReactPointerEvent) {
    if (busy) return;
    // Mouse: HTML5 drag + button click. Touch/pen: pointer drag.
    if (event.pointerType === "mouse") return;
    pointerRef.current = {
      photoId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent) {
    const state = pointerRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      state.dragging = true;
      suppressClickRef.current = true;
      setDragId(state.photoId);
    }

    event.preventDefault();
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const tile = el?.closest<HTMLElement>("[data-organize-photo-id]");
    const overId = tile?.dataset.organizePhotoId;
    if (overId && overId !== state.photoId) {
      applyMove(state.photoId, overId);
    }
  }

  function onPointerUp(event: ReactPointerEvent) {
    const state = pointerRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const wasDragging = state.dragging;
    const photoId = state.photoId;
    pointerRef.current = null;
    setDragId(null);

    if (wasDragging) return;
    // Short tap on touch → select / deselect.
    onToggleSelected(photoId);
  }

  function onTileClick(photoId: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // Touch already toggles in onPointerUp.
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      return;
    }
    onToggleSelected(photoId);
  }

  return (
    <div
      aria-label="Reorganizar fotos"
      className={`${styles.squareGrid} ${styles.photoOrganizeGrid}`}
      data-dragging={dragId ? "true" : "false"}
    >
      {items.map((photo) => {
        const selected = selectedIds.has(photo.id);
        const dragging = dragId === photo.id;
        return (
          <div
            className={styles.photoOrganizeTile}
            data-dragging={dragging ? "true" : "false"}
            data-organize-photo-id={photo.id}
            data-selected={selected ? "true" : "false"}
            draggable={htmlDragEnabled && !busy}
            key={photo.id}
            onDragEnd={onDragEnd}
            onDragOver={(event) => onDragOver(photo.id, event)}
            onDragStart={(event) => onDragStart(photo.id, event)}
            onPointerCancel={onPointerUp}
            onPointerDown={(event) => onPointerDown(photo.id, event)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <button
              aria-label={selected ? "Foto selecionada" : "Selecionar foto"}
              aria-pressed={selected}
              className={styles.tileButton}
              data-selected={selected ? "true" : "false"}
              disabled={busy}
              onClick={() => onTileClick(photo.id)}
              type="button"
            >
              <OrganizeThumb photo={photo} />
              <span aria-hidden="true" className={styles.photoOrganizeHandle}>
                ⋮⋮
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";

import { toneFromId, type TripPhoto } from "../../album-types";
import styles from "../../trip.module.css";

const SWIPE_THRESHOLD_PX = 56;
const TAP_SLOP_PX = 28;
const DRAG_FACTOR = 0.72;
const WIDE_STACK_MQ = "(min-width: 1100px)";
const COMPACT_DOTS_MQ = "(max-width: 719px)";
const COMPACT_DOT_WINDOW = 7;

/** Visible dot indexes — compact window on small screens when there are many photos. */
function getDotIndexes(
  active: number,
  count: number,
  compact: boolean,
): number[] {
  if (count <= 0) return [];
  if (!compact || count <= COMPACT_DOT_WINDOW) {
    return Array.from({ length: count }, (_, index) => index);
  }
  const half = Math.floor(COMPACT_DOT_WINDOW / 2);
  let start = Math.max(0, active - half);
  const end = Math.min(count - 1, start + COMPACT_DOT_WINDOW - 1);
  start = Math.max(0, end - COMPACT_DOT_WINDOW + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index % count + count) % count;
}

/**
 * Shortest signed ring offset in (-count/2, count/2].
 * For even counts the far opposite prefers +count/2 (never -count/2).
 */
function getSignedRingOffset(
  index: number,
  active: number,
  count: number,
): number {
  if (count <= 0) return 0;
  let offset = ((index - active) % count + count) % count;
  if (offset > Math.floor(count / 2)) offset -= count;
  return offset;
}

type CarouselSlot = "-2" | "-1" | "0" | "1" | "2" | "hidden";

function getCarouselSlot(
  index: number,
  active: number,
  imagesLength: number,
  maxDepth: number,
): CarouselSlot {
  if (imagesLength <= 0) return "hidden";
  const offset = getSignedRingOffset(index, active, imagesLength);
  if (Math.abs(offset) > maxDepth) return "hidden";
  if (offset === -2) return "-2";
  if (offset === -1) return "-1";
  if (offset === 0) return "0";
  if (offset === 1) return "1";
  if (offset === 2) return "2";
  return "hidden";
}

function useCarouselMaxDepth(photoCount: number): number {
  const [viewportDepth, setViewportDepth] = useState(1);

  useEffect(() => {
    const media = window.matchMedia(WIDE_STACK_MQ);
    const sync = () => setViewportDepth(media.matches ? 2 : 1);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (photoCount <= 1) return 0;
  return Math.min(viewportDepth, Math.floor(photoCount / 2));
}

function useCompactDots(): boolean {
  const [compact, setCompact] = useState(true);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_DOTS_MQ);
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return compact;
}

function CarouselPhoto({
  photo,
  preferFull,
  preloadFull,
  eager,
}: {
  readonly photo: TripPhoto;
  readonly preferFull: boolean;
  readonly preloadFull: boolean;
  readonly eager?: boolean;
}) {
  const thumbSrc = useLocalPhotoObjectUrl(photo.id, "thumbnail");
  const fullSrc = useLocalPhotoObjectUrl(
    preferFull || preloadFull ? photo.id : null,
    "full",
  );
  const showFull = preferFull && Boolean(fullSrc);
  const hasImage = Boolean(thumbSrc || showFull);

  return (
    <span
      className={styles.albumCarouselSlide}
      data-has-image={hasImage ? "true" : "false"}
      data-tone={toneFromId(photo.id)}
    >
      {thumbSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={styles.albumCarouselImage}
          decoding="async"
          draggable={false}
          loading={eager ? "eager" : "lazy"}
          src={thumbSrc}
        />
      ) : null}
      {showFull && fullSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={`${styles.albumCarouselImage} ${styles.albumCarouselImageFull}`}
          decoding="async"
          draggable={false}
          src={fullSrc}
        />
      ) : null}
    </span>
  );
}

/** Drag offset only — place/rotate/scale come from CSS `data-slot`. */
function getStackedCardStyle(
  slot: CarouselSlot,
  offset: number,
): CSSProperties {
  const drag = `${offset * DRAG_FACTOR}px`;

  if (slot === "hidden") {
    return {
      opacity: 0,
      pointerEvents: "none",
    };
  }

  return {
    ["--carousel-drag" as string]: drag,
    opacity: 1,
  };
}

function isCarouselControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest("[data-carousel-control='true']"))
  );
}

export function AlbumCarousel({
  photos,
  onOpen,
  getHref,
  getCaption,
  getCaptionText,
  centerActionLabel = "Abrir foto em destaque",
}: {
  readonly photos: readonly TripPhoto[];
  readonly onOpen: (photoId: string) => void;
  /** When set, the center card is a real link (more reliable on iOS). */
  readonly getHref?: (photo: TripPhoto) => string | null;
  readonly getCaption?: (photo: TripPhoto) => ReactNode;
  readonly getCaptionText?: (photo: TripPhoto) => string | null;
  readonly centerActionLabel?: string;
}) {
  const pointerStartXRef = useRef(0);
  const pointerStartYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lockAxisRef = useRef<"x" | "y" | null>(null);
  const movedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const pointerOnCenterRef = useRef(false);
  const settleFrameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const count = photos.length;
  const safeIndex = count === 0 ? 0 : Math.min(activeIndex, count - 1);
  const maxDepth = useCarouselMaxDepth(count);
  const compactDots = useCompactDots();
  const dotIndexes = getDotIndexes(safeIndex, count, compactDots);

  useEffect(() => {
    setActiveIndex((current) =>
      count === 0 ? 0 : Math.min(current, count - 1),
    );
  }, [count]);

  useEffect(() => {
    return () => {
      if (settleFrameRef.current !== null) {
        cancelAnimationFrame(settleFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (count < 2) return;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((current) => wrapIndex(current - 1, count));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((current) => wrapIndex(current + 1, count));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count]);

  if (count === 0) {
    return (
      <div className={styles.albumCarouselEmpty}>
        <p>Este álbum ainda não tem fotos.</p>
      </div>
    );
  }

  function goPrevious() {
    setActiveIndex((current) => wrapIndex(current - 1, count));
  }

  function goNext() {
    setActiveIndex((current) => wrapIndex(current + 1, count));
  }

  /** Commit index without springing the drag back first (avoids the “zuado” snap). */
  function commitIndex(nextIndex: number) {
    if (settleFrameRef.current !== null) {
      cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
    setIsDragging(true);
    setDragOffset(0);
    setActiveIndex(nextIndex);
    settleFrameRef.current = requestAnimationFrame(() => {
      settleFrameRef.current = requestAnimationFrame(() => {
        settleFrameRef.current = null;
        setIsDragging(false);
      });
    });
  }

  function openActivePhoto() {
    const photo = photos[safeIndex];
    if (!photo) return;
    onOpen(photo.id);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (isCarouselControlTarget(event.target)) return;
    if (settleFrameRef.current !== null) {
      cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }

    const card =
      event.target instanceof Element
        ? event.target.closest("[data-slot]")
        : null;
    pointerOnCenterRef.current =
      card?.getAttribute("data-slot") === "0" || count <= 1;

    movedRef.current = false;
    suppressClickRef.current = false;
    pointerStartXRef.current = event.clientX;
    pointerStartYRef.current = event.clientY;

    if (count <= 1) {
      isDraggingRef.current = false;
      lockAxisRef.current = null;
      return;
    }

    isDraggingRef.current = true;
    lockAxisRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    const deltaX = event.clientX - pointerStartXRef.current;
    const deltaY = event.clientY - pointerStartYRef.current;

    if (lockAxisRef.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      lockAxisRef.current =
        Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
      if (lockAxisRef.current === "y") {
        isDraggingRef.current = false;
        setIsDragging(false);
        setDragOffset(0);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        return;
      }
      setIsDragging(true);
    }

    if (lockAxisRef.current !== "x") return;

    event.preventDefault();
    if (Math.abs(deltaX) > SWIPE_THRESHOLD_PX) {
      movedRef.current = true;
      suppressClickRef.current = true;
    }
    setDragOffset(deltaX);
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const deltaX = event.clientX - pointerStartXRef.current;
    const deltaY = event.clientY - pointerStartYRef.current;
    const isTap =
      Math.abs(deltaX) < TAP_SLOP_PX && Math.abs(deltaY) < TAP_SLOP_PX;

    // Single photo: no drag session — open on tap via pointerup (iOS-safe).
    if (count <= 1) {
      if (isTap && pointerOnCenterRef.current) {
        suppressClickRef.current = true;
        openActivePhoto();
      }
      lockAxisRef.current = null;
      return;
    }

    if (!isDraggingRef.current) {
      // Vertical scroll abandoned drag; still allow center tap to open.
      if (isTap && pointerOnCenterRef.current && !movedRef.current) {
        suppressClickRef.current = true;
        openActivePhoto();
      }
      lockAxisRef.current = null;
      return;
    }

    const axis = lockAxisRef.current;
    isDraggingRef.current = false;
    lockAxisRef.current = null;

    if (axis === "x" && deltaX <= -SWIPE_THRESHOLD_PX) {
      suppressClickRef.current = true;
      movedRef.current = true;
      commitIndex(wrapIndex(safeIndex + 1, count));
      return;
    }
    if (axis === "x" && deltaX >= SWIPE_THRESHOLD_PX) {
      suppressClickRef.current = true;
      movedRef.current = true;
      commitIndex(wrapIndex(safeIndex - 1, count));
      return;
    }

    setIsDragging(false);
    setDragOffset(0);

    // Tap on center card: open folder now. Don't wait for click (often lost
    // on iOS after pointer capture on the stage).
    if (isTap && pointerOnCenterRef.current) {
      suppressClickRef.current = true;
      movedRef.current = false;
      openActivePhoto();
      return;
    }

    suppressClickRef.current = false;
    movedRef.current = false;
  }

  const nextIndex = wrapIndex(safeIndex + 1, count);
  const prevIndex = wrapIndex(safeIndex - 1, count);
  const stackDepth = maxDepth >= 2 ? "5" : "3";

  return (
    <div
      aria-label="Carrossel do álbum"
      className={styles.albumCarouselOuter}
      data-stack-depth={stackDepth}
    >
      <div className={styles.albumCarousel}>
        <div
          className={styles.albumCarouselStage}
          data-dragging={isDragging ? "true" : "false"}
          data-stack-depth={stackDepth}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
        >
          {count > 1 ? (
            <>
              <button
                aria-label="Foto anterior"
                className={`${styles.albumCarouselArrow} ${styles.albumCarouselArrowPrev}`}
                data-carousel-control="true"
                onClick={goPrevious}
                type="button"
              >
                ‹
              </button>
              <button
                aria-label="Próxima foto"
                className={`${styles.albumCarouselArrow} ${styles.albumCarouselArrowNext}`}
                data-carousel-control="true"
                onClick={goNext}
                type="button"
              >
                ›
              </button>
            </>
          ) : null}

          {photos.map((photo, index) => {
            const slot = getCarouselSlot(index, safeIndex, count, maxDepth);
            const isCenter = slot === "0";
            const visible = slot !== "hidden";
            const caption = isCenter ? (getCaption?.(photo) ?? null) : null;
            const captionText =
              getCaptionText?.(photo)?.trim() ||
              (typeof caption === "string" ? caption.trim() : null);
            const href = isCenter ? (getHref?.(photo) ?? null) : null;
            const label = isCenter
              ? captionText
                ? `${centerActionLabel}: ${captionText}`
                : centerActionLabel
              : "Selecionar foto";

            const media = (
              <>
                {visible ? (
                  <CarouselPhoto
                    eager={isCenter}
                    photo={photo}
                    preferFull={isCenter}
                    preloadFull={index === nextIndex || index === prevIndex}
                  />
                ) : null}
                {caption ? (
                  <span className={styles.albumCarouselCaption}>{caption}</span>
                ) : null}
              </>
            );

            return (
              <article
                className={styles.albumCarouselCard}
                data-active={isCenter ? "true" : "false"}
                data-slot={slot}
                key={photo.id}
                style={getStackedCardStyle(slot, dragOffset)}
              >
                {href ? (
                  <Link
                    aria-current="true"
                    aria-label={label}
                    className={styles.albumCarouselCardButton}
                    href={href}
                    onClick={(event) => {
                      if (suppressClickRef.current || movedRef.current) {
                        event.preventDefault();
                        suppressClickRef.current = false;
                        movedRef.current = false;
                      }
                    }}
                  >
                    {media}
                  </Link>
                ) : (
                  <button
                    aria-current={isCenter ? "true" : undefined}
                    aria-label={label}
                    className={styles.albumCarouselCardButton}
                    onClick={() => {
                      if (suppressClickRef.current || movedRef.current) {
                        suppressClickRef.current = false;
                        movedRef.current = false;
                        return;
                      }
                      if (isCenter) {
                        onOpen(photo.id);
                        return;
                      }
                      commitIndex(index);
                    }}
                    type="button"
                  >
                    {media}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {count > 1 ? (
        <div
          aria-label={`Foto ${safeIndex + 1} de ${count}`}
          className={styles.albumCarouselDots}
          role="tablist"
        >
          {dotIndexes.map((index) => (
            <button
              aria-label={`Ir para foto ${index + 1}`}
              aria-selected={index === safeIndex}
              className={styles.albumCarouselDot}
              data-active={index === safeIndex ? "true" : "false"}
              data-carousel-control="true"
              key={photos[index]?.id ?? index}
              onClick={() => commitIndex(index)}
              role="tab"
              type="button"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

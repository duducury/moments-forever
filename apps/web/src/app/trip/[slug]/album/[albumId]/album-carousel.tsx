"use client";

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

const SWIPE_THRESHOLD_PX = 45;
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
  let end = Math.min(count - 1, start + COMPACT_DOT_WINDOW - 1);
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
  const drag = `${offset * 0.1}px`;

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

export function AlbumCarousel({
  photos,
  onOpen,
  getCaption,
  getCaptionText,
  centerActionLabel = "Abrir foto em destaque",
}: {
  readonly photos: readonly TripPhoto[];
  readonly onOpen: (photoId: string) => void;
  readonly getCaption?: (photo: TripPhoto) => ReactNode;
  readonly getCaptionText?: (photo: TripPhoto) => string | null;
  readonly centerActionLabel?: string;
}) {
  const pointerStartXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const movedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const count = photos.length;
  const safeIndex = count === 0 ? 0 : Math.min(activeIndex, count - 1);
  const maxDepth = useCarouselMaxDepth(count);
  const compactDots = useCompactDots();
  const dotIndexes = getDotIndexes(safeIndex, count, compactDots);

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

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (count <= 1) return;
    isDraggingRef.current = true;
    movedRef.current = false;
    pointerStartXRef.current = event.clientX;
    setIsDragging(true);
    setDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    const deltaX = event.clientX - pointerStartXRef.current;
    if (Math.abs(deltaX) > 6) movedRef.current = true;
    setDragOffset(deltaX);
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    const deltaX = event.clientX - pointerStartXRef.current;
    isDraggingRef.current = false;
    setIsDragging(false);
    setDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (deltaX <= -SWIPE_THRESHOLD_PX) {
      goNext();
      return;
    }
    if (deltaX >= SWIPE_THRESHOLD_PX) {
      goPrevious();
    }
  }

  const nextIndex = wrapIndex(safeIndex + 1, count);
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
                onClick={goPrevious}
                type="button"
              >
                ‹
              </button>
              <button
                aria-label="Próxima foto"
                className={`${styles.albumCarouselArrow} ${styles.albumCarouselArrowNext}`}
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

            return (
              <article
                className={styles.albumCarouselCard}
                data-active={isCenter ? "true" : "false"}
                data-slot={slot}
                key={photo.id}
                style={getStackedCardStyle(slot, dragOffset)}
              >
                <button
                  aria-current={isCenter ? "true" : undefined}
                  aria-label={
                    isCenter
                      ? captionText
                        ? `${centerActionLabel}: ${captionText}`
                        : centerActionLabel
                      : "Selecionar foto"
                  }
                  className={styles.albumCarouselCardButton}
                  onClick={() => {
                    if (movedRef.current) {
                      movedRef.current = false;
                      return;
                    }
                    if (isCenter) {
                      onOpen(photo.id);
                      return;
                    }
                    setActiveIndex(index);
                  }}
                  type="button"
                >
                  {visible ? (
                    <CarouselPhoto
                      eager={visible}
                      photo={photo}
                      preferFull={visible}
                      preloadFull={index === nextIndex}
                    />
                  ) : null}
                  {caption ? (
                    <span className={styles.albumCarouselCaption}>
                      {caption}
                    </span>
                  ) : null}
                </button>
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
              key={photos[index]?.id ?? index}
              onClick={() => setActiveIndex(index)}
              role="tab"
              type="button"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

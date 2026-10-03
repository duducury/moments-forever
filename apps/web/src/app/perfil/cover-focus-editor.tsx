"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import {
  CENTER_FOCUS,
  clampFocus,
  isCenterFocus,
  type CoverFocus,
} from "@/lib/experiences/cover-focus";
import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";

import styles from "./perfil.module.css";

const KEY_STEP = 4;

/**
 * Lets the owner pick which part of the cover photo stays visible: drag the
 * marker onto the subject (or use the arrow keys) and the two crops the app
 * actually uses (phone card 16:9, desktop card 4:5) update live.
 */
export function CoverFocusEditor({
  coverPhotoId,
  focus,
  onChange,
  title,
}: {
  readonly coverPhotoId: string;
  readonly focus: CoverFocus;
  readonly onChange: (focus: CoverFocus) => void;
  readonly title: string;
}) {
  const src = useLocalPhotoObjectUrl(coverPhotoId, "thumbnail");
  const frameRef = useRef<HTMLDivElement | null>(null);

  function moveTo(clientX: number, clientY: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    onChange(
      clampFocus({
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
      }),
    );
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX, event.clientY);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveTo(event.clientX, event.clientY);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta: Record<string, readonly [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const step = delta[event.key];
    if (!step) return;
    event.preventDefault();
    onChange(clampFocus({ x: focus.x + step[0], y: focus.y + step[1] }));
  }

  return (
    <div className={styles.focusEditor}>
      <p className={styles.fieldHint}>
        Arraste o ponto para o que deve aparecer no centro da capa.
      </p>
      <div
        aria-label="Ponto central da capa"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(focus.x)}
        aria-valuetext={`${Math.round(focus.x)}% horizontal, ${Math.round(focus.y)}% vertical`}
        className={styles.focusFrame}
        data-testid="cover-focus-frame"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        ref={frameRef}
        role="slider"
        tabIndex={0}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className={styles.focusImage} draggable={false} src={src} />
        ) : (
          <span className={styles.focusImagePending} />
        )}
        <span
          aria-hidden="true"
          className={styles.focusMarker}
          style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
        />
      </div>

      <div className={styles.focusPreviews}>
        <figure className={styles.focusPreview}>
          <ExperienceCoverThumb
            className={styles.focusPreviewWide}
            coverPhotoId={coverPhotoId}
            fallbackClassName={styles.focusPreviewWide}
            focus={focus}
            imageClassName={styles.coverImage}
            title={title}
            variant="thumbnail"
          />
          <figcaption>Celular</figcaption>
        </figure>
        <figure className={styles.focusPreview}>
          <ExperienceCoverThumb
            className={styles.focusPreviewTall}
            coverPhotoId={coverPhotoId}
            fallbackClassName={styles.focusPreviewTall}
            focus={focus}
            imageClassName={styles.coverImage}
            title={title}
            variant="thumbnail"
          />
          <figcaption>Computador</figcaption>
        </figure>
      </div>

      <button
        className="button secondary"
        disabled={isCenterFocus(focus)}
        onClick={() => onChange(CENTER_FOCUS)}
        type="button"
      >
        Centralizar
      </button>
    </div>
  );
}

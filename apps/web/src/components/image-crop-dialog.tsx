"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  coverFitScale,
  exportSquareCrop,
  loadImageElement,
  type SquareCropTransform,
} from "@/lib/images/crop-square";

import styles from "./image-crop-dialog.module.css";

const VIEWPORT = 280;
const MIN_SCALE = 1;
const MAX_SCALE = 3;

function clampOffsets(
  imageWidth: number,
  imageHeight: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  const base = coverFitScale(imageWidth, imageHeight, VIEWPORT);
  const displayScale = base * scale;
  const displayWidth = imageWidth * displayScale;
  const displayHeight = imageHeight * displayScale;
  const maxX = Math.max(0, (displayWidth - VIEWPORT) / 2);
  const maxY = Math.max(0, (displayHeight - VIEWPORT) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offsetX)),
    y: Math.min(maxY, Math.max(-maxY, offsetY)),
  };
}

export function ImageCropDialog({
  imageSrc,
  title = "Encaixar foto",
  confirmLabel = "Usar foto",
  shape = "circle",
  onCancel,
  onConfirm,
}: {
  readonly imageSrc: string;
  readonly title?: string;
  readonly confirmLabel?: string;
  readonly shape?: "circle" | "square";
  readonly onCancel: () => void;
  readonly onConfirm: (file: File) => void | Promise<void>;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [transform, setTransform] = useState<SquareCropTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
  } | null>(null);
  const transformRef = useRef(transform);
  const naturalRef = useRef(natural);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    naturalRef.current = natural;
  }, [natural]);

  useEffect(() => {
    let cancelled = false;
    void loadImageElement(imageSrc)
      .then((image) => {
        if (cancelled) return;
        setNatural({ w: image.naturalWidth, h: image.naturalHeight });
        setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível abrir a imagem.");
      });
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  function setClamped(
    nextScale: number,
    offsetX: number,
    offsetY: number,
  ) {
    const size = naturalRef.current;
    if (!size) {
      setTransform({ scale: nextScale, offsetX, offsetY });
      return;
    }
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const clamped = clampOffsets(size.w, size.h, scale, offsetX, offsetY);
    setTransform({ scale, offsetX: clamped.x, offsetY: clamped.y });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pinchRef.current) return;
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: transformRef.current.offsetX,
      originY: transformRef.current.offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pinchRef.current) return;
    setClamped(
      transformRef.current.scale,
      pan.originX + (event.clientX - pan.startX),
      pan.originY + (event.clientY - pan.startY),
    );
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  useEffect(() => {
    const el = document.getElementById("avatar-crop-stage");
    if (!el) return;

    function distance(a: Touch, b: Touch) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length >= 2) {
        const a = event.touches[0];
        const b = event.touches[1];
        if (!a || !b) return;
        panRef.current = null;
        pinchRef.current = {
          startDistance: Math.max(1, distance(a, b)),
          startScale: transformRef.current.scale,
        };
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (event.touches.length >= 2 && pinchRef.current) {
        event.preventDefault();
        const a = event.touches[0];
        const b = event.touches[1];
        if (!a || !b) return;
        const next =
          pinchRef.current.startScale *
          (distance(a, b) / pinchRef.current.startDistance);
        setClamped(
          next,
          transformRef.current.offsetX,
          transformRef.current.offsetY,
        );
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (event.touches.length < 2) {
        pinchRef.current = null;
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const blob = await exportSquareCrop({
        imageSrc,
        viewport: VIEWPORT,
        transform,
        outputSize: 960,
      });
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      await onConfirm(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao recortar.");
    } finally {
      setBusy(false);
    }
  }

  const base =
    natural != null
      ? coverFitScale(natural.w, natural.h, VIEWPORT)
      : 1;
  const displayScale = base * transform.scale;

  return (
    <div
      aria-label={title}
      aria-modal="true"
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      role="dialog"
    >
      <div className={styles.card}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.hint}>
          Arraste para encaixar · pinça ou slider para zoom
        </p>

        <div
          className={styles.stage}
          data-shape={shape}
          id="avatar-crop-stage"
          onPointerCancel={onPointerUp}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ width: VIEWPORT, height: VIEWPORT }}
        >
          {natural ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className={styles.image}
              draggable={false}
              src={imageSrc}
              style={{
                width: natural.w * displayScale,
                height: natural.h * displayScale,
                transform: `translate(-50%, -50%) translate(${transform.offsetX}px, ${transform.offsetY}px)`,
              }}
            />
          ) : (
            <p className={styles.loading}>Carregando…</p>
          )}
          <div aria-hidden className={styles.mask} data-shape={shape} />
        </div>

        <label className={styles.zoomLabel} htmlFor="avatar-crop-zoom">
          Zoom
        </label>
        <input
          className={styles.zoomRange}
          disabled={!natural || busy}
          id="avatar-crop-zoom"
          max={MAX_SCALE}
          min={MIN_SCALE}
          onChange={(event) => {
            setClamped(
              Number(event.target.value),
              transform.offsetX,
              transform.offsetY,
            );
          }}
          step={0.01}
          type="range"
          value={transform.scale}
        />

        <div className={styles.actions}>
          <button
            className="button primary"
            disabled={!natural || busy}
            onClick={() => void confirm()}
            type="button"
          >
            {busy ? "Preparando…" : confirmLabel}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./trip.module.css";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_SCALE = 2.4;

function distance(
  a: { readonly clientX: number; readonly clientY: number },
  b: { readonly clientX: number; readonly clientY: number },
): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export function LightboxZoomStage({
  photoId,
  hasImage,
  tone,
  children,
  onSwipe,
}: {
  readonly photoId: string;
  readonly hasImage: boolean;
  readonly tone: string;
  readonly children: ReactNode;
  readonly onSwipe?: (delta: -1 | 1) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const swipeRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    pinchRef.current = null;
    panRef.current = null;
    swipeRef.current = null;
    lastTapRef.current = null;
  }, [photoId]);

  function clampOffset(nextScale: number, x: number, y: number) {
    const el = stageRef.current;
    if (!el || nextScale <= 1) return { x: 0, y: 0 };
    const maxX = ((nextScale - 1) * el.clientWidth) / 2;
    const maxY = ((nextScale - 1) * el.clientHeight) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length >= 2) {
        const a = event.touches[0];
        const b = event.touches[1];
        if (!a || !b) return;
        pinchRef.current = {
          startDistance: Math.max(1, distance(a, b)),
          startScale: scaleRef.current,
        };
        panRef.current = null;
        swipeRef.current = null;
        lastTapRef.current = null;
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;

      if (scaleRef.current > 1.01) {
        panRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          originX: offsetRef.current.x,
          originY: offsetRef.current.y,
        };
        swipeRef.current = null;
      } else {
        swipeRef.current = touch.clientX;
        panRef.current = null;
      }

      const now = Date.now();
      const last = lastTapRef.current;
      if (
        last &&
        now - last.time <= DOUBLE_TAP_MS &&
        Math.hypot(touch.clientX - last.x, touch.clientY - last.y) < 36
      ) {
        lastTapRef.current = null;
        if (scaleRef.current > 1.01) {
          setScale(1);
          setOffset({ x: 0, y: 0 });
        } else {
          setScale(DOUBLE_TAP_SCALE);
          setOffset({ x: 0, y: 0 });
        }
        swipeRef.current = null;
        return;
      }
      lastTapRef.current = {
        time: now,
        x: touch.clientX,
        y: touch.clientY,
      };
    }

    function onTouchMove(event: TouchEvent) {
      if (event.touches.length >= 2) {
        event.preventDefault();
        const a = event.touches[0];
        const b = event.touches[1];
        if (!a || !b || !pinchRef.current) return;
        const next = Math.min(
          MAX_SCALE,
          Math.max(
            MIN_SCALE,
            pinchRef.current.startScale *
              (distance(a, b) / pinchRef.current.startDistance),
          ),
        );
        setScale(next);
        setOffset((current) => clampOffset(next, current.x, current.y));
        return;
      }

      if (scaleRef.current > 1.01 && panRef.current && event.touches[0]) {
        event.preventDefault();
        const touch = event.touches[0];
        const next = clampOffset(
          scaleRef.current,
          panRef.current.originX + (touch.clientX - panRef.current.startX),
          panRef.current.originY + (touch.clientY - panRef.current.startY),
        );
        setOffset(next);
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (event.touches.length === 0) {
        pinchRef.current = null;
        panRef.current = null;
        if (swipeRef.current !== null && scaleRef.current <= 1.01 && onSwipe) {
          const endX = event.changedTouches[0]?.clientX ?? swipeRef.current;
          const distanceX = endX - swipeRef.current;
          swipeRef.current = null;
          if (distanceX <= -48) onSwipe(1);
          else if (distanceX >= 48) onSwipe(-1);
        } else {
          swipeRef.current = null;
        }
      }
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
  }, [onSwipe]);

  return (
    <div
      className={styles.lightboxStage}
      data-has-image={hasImage ? "true" : "false"}
      data-tone={tone}
      data-zoomed={scale > 1.01 ? "true" : "false"}
      ref={stageRef}
    >
      <div
        className={styles.lightboxZoomLayer}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

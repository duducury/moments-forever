"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";

import styles from "./trip.module.css";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_SCALE = 2.4;
const AXIS_LOCK_PX = 10;
const DISMISS_DISTANCE_PX = 96;
const DISMISS_VELOCITY = 0.55;
const SWIPE_DISTANCE_PX = 48;
const SWIPE_VELOCITY = 0.4;
const SLIDE_MS = 280;

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
  prevSlide = null,
  nextSlide = null,
  onSwipe,
  onDismiss,
  onDismissDrag,
}: {
  readonly photoId: string;
  readonly hasImage: boolean;
  readonly tone: string;
  readonly children: ReactNode;
  readonly prevSlide?: ReactNode;
  readonly nextSlide?: ReactNode;
  readonly onSwipe?: (delta: -1 | 1) => void;
  readonly onDismiss?: () => void;
  readonly onDismissDrag?: (offsetY: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [settle, setSettle] = useState(false);
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
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    axis: "undecided" | "horizontal" | "vertical";
    lastX: number;
    lastY: number;
    lastTime: number;
    velocityX: number;
    velocityY: number;
  } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  const onSwipeRef = useRef(onSwipe);
  const onDismissRef = useRef(onDismiss);
  const onDismissDragRef = useRef(onDismissDrag);
  const pendingSwipeRef = useRef<-1 | 1 | null>(null);
  const skipPhotoResetRef = useRef(false);
  const canSlide = Boolean(onSwipe);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    onSwipeRef.current = onSwipe;
  }, [onSwipe]);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    onDismissDragRef.current = onDismissDrag;
  }, [onDismissDrag]);

  useEffect(() => {
    if (skipPhotoResetRef.current) {
      skipPhotoResetRef.current = false;
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setDragY(0);
      onDismissDragRef.current?.(0);
      pinchRef.current = null;
      panRef.current = null;
      gestureRef.current = null;
      lastTapRef.current = null;
      return;
    }
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragY(0);
    setDragX(0);
    setSettle(false);
    pendingSwipeRef.current = null;
    onDismissDragRef.current?.(0);
    pinchRef.current = null;
    panRef.current = null;
    gestureRef.current = null;
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

  function setDismissDrag(nextY: number) {
    setDragY(nextY);
    onDismissDragRef.current?.(nextY);
  }

  function stageWidth() {
    return stageRef.current?.clientWidth || window.innerWidth || 1;
  }

  function commitSwipe(delta: -1 | 1) {
    if (!onSwipeRef.current || pendingSwipeRef.current != null) return;
    if (delta === 1 && nextSlide == null) {
      setSettle(true);
      setDragX(0);
      return;
    }
    if (delta === -1 && prevSlide == null) {
      setSettle(true);
      setDragX(0);
      return;
    }
    const width = stageWidth();
    pendingSwipeRef.current = delta;
    setSettle(true);
    setDragX(delta === 1 ? -width : width);
  }

  function onTrackTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.propertyName !== "transform") return;
    const pending = pendingSwipeRef.current;
    if (pending == null) {
      setSettle(false);
      return;
    }
    pendingSwipeRef.current = null;
    skipPhotoResetRef.current = true;
    setSettle(false);
    setDragX(0);
    onSwipeRef.current?.(pending);
  }

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    function onTouchStart(event: TouchEvent) {
      if (pendingSwipeRef.current != null) return;

      if (event.touches.length >= 2) {
        const a = event.touches[0];
        const b = event.touches[1];
        if (!a || !b) return;
        pinchRef.current = {
          startDistance: Math.max(1, distance(a, b)),
          startScale: scaleRef.current,
        };
        panRef.current = null;
        gestureRef.current = null;
        lastTapRef.current = null;
        setDismissDrag(0);
        setDragX(0);
        setSettle(false);
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      setSettle(false);

      if (scaleRef.current > 1.01) {
        panRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          originX: offsetRef.current.x,
          originY: offsetRef.current.y,
        };
        gestureRef.current = null;
      } else {
        const now = Date.now();
        gestureRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          axis: "undecided",
          lastX: touch.clientX,
          lastY: touch.clientY,
          lastTime: now,
          velocityX: 0,
          velocityY: 0,
        };
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
        gestureRef.current = null;
        setDismissDrag(0);
        setDragX(0);
        return;
      }
      lastTapRef.current = {
        time: now,
        x: touch.clientX,
        y: touch.clientY,
      };
    }

    function onTouchMove(event: TouchEvent) {
      if (pendingSwipeRef.current != null) return;

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
        return;
      }

      const gesture = gestureRef.current;
      const touch = event.touches[0];
      if (!gesture || !touch || scaleRef.current > 1.01) return;

      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;

      if (gesture.axis === "undecided") {
        if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
        gesture.axis =
          Math.abs(dy) >= Math.abs(dx) * 1.15 ? "vertical" : "horizontal";
      }

      const now = Date.now();
      const dt = Math.max(1, now - gesture.lastTime);

      if (gesture.axis === "vertical") {
        event.preventDefault();
        gesture.velocityY = (touch.clientY - gesture.lastY) / dt;
        gesture.lastY = touch.clientY;
        gesture.lastTime = now;
        setDragX(0);
        setDismissDrag(dy);
        return;
      }

      if (gesture.axis === "horizontal") {
        event.preventDefault();
        gesture.velocityX = (touch.clientX - gesture.lastX) / dt;
        gesture.lastX = touch.clientX;
        gesture.lastTime = now;
        setDismissDrag(0);
        if (!canSlide) return;
        let nextX = dx;
        if (dx < 0 && nextSlide == null) nextX = dx * 0.2;
        if (dx > 0 && prevSlide == null) nextX = dx * 0.2;
        setDragX(nextX);
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (event.touches.length > 0) {
        if (event.touches.length < 2) pinchRef.current = null;
        return;
      }

      pinchRef.current = null;
      panRef.current = null;

      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (
        !gesture ||
        scaleRef.current > 1.01 ||
        pendingSwipeRef.current != null
      ) {
        if (pendingSwipeRef.current == null) {
          setDismissDrag(0);
          setDragX(0);
        }
        return;
      }

      if (gesture.axis === "vertical") {
        const endY = event.changedTouches[0]?.clientY ?? gesture.lastY;
        const distanceY = endY - gesture.startY;
        const shouldDismiss =
          Math.abs(distanceY) >= DISMISS_DISTANCE_PX ||
          Math.abs(gesture.velocityY) >= DISMISS_VELOCITY;
        if (shouldDismiss && onDismissRef.current) {
          onDismissRef.current();
          return;
        }
        setDismissDrag(0);
        setDragX(0);
        return;
      }

      if (gesture.axis === "horizontal" && onSwipeRef.current && canSlide) {
        const endX = event.changedTouches[0]?.clientX ?? gesture.startX;
        const distanceX = endX - gesture.startX;
        const shouldNext =
          (distanceX <= -SWIPE_DISTANCE_PX ||
            gesture.velocityX <= -SWIPE_VELOCITY) &&
          nextSlide != null;
        const shouldPrev =
          (distanceX >= SWIPE_DISTANCE_PX ||
            gesture.velocityX >= SWIPE_VELOCITY) &&
          prevSlide != null;
        if (shouldNext) {
          commitSwipe(1);
          return;
        }
        if (shouldPrev) {
          commitSwipe(-1);
          return;
        }
      }

      setDismissDrag(0);
      setSettle(true);
      setDragX(0);
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
  }, [canSlide, nextSlide, prevSlide]);

  const dismissing = Math.abs(dragY) > 0.5;
  const useTrack = canSlide && scale <= 1.01;

  return (
    <div
      className={styles.lightboxStage}
      data-dismissing={dismissing ? "true" : "false"}
      data-has-image={hasImage ? "true" : "false"}
      data-tone={tone}
      data-zoomed={scale > 1.01 ? "true" : "false"}
      ref={stageRef}
    >
      {useTrack ? (
        <div
          className={styles.lightboxSlideTrack}
          onTransitionEnd={onTrackTransitionEnd}
          style={{
            transform: `translate3d(${dragX}px, ${dragY}px, 0)`,
            transition: settle
              ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
              : "none",
          }}
        >
          <div className={styles.lightboxSlide} data-slot="prev">
            {prevSlide}
          </div>
          <div className={styles.lightboxSlide} data-slot="current">
            {children}
          </div>
          <div className={styles.lightboxSlide} data-slot="next">
            {nextSlide}
          </div>
        </div>
      ) : (
        <div
          className={styles.lightboxZoomLayer}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y + dragY}px, 0) scale(${scale})`,
            transition: dismissing ? "none" : "transform 120ms ease-out",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

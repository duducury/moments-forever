"use client";

import { useEffect, useRef, useState } from "react";

import { useLocalPhotoObjectUrl } from "./use-local-photo-urls";

/**
 * Thumbnail first, then full when near the viewport.
 * Album grids no longer use this (thumb-only for bandwidth); kept for surfaces
 * that still want progressive upgrade to the MVP preview (`full`).
 */
export function useProgressiveLocalPhoto(photoId: string | null | undefined) {
  const nodeRef = useRef<HTMLSpanElement | null>(null);
  const [loadFull, setLoadFull] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  const thumbSrc = useLocalPhotoObjectUrl(photoId, "thumbnail");
  const fullSrc = useLocalPhotoObjectUrl(loadFull ? photoId : null, "full");

  useEffect(() => {
    if (!photoId || loadFull) return;
    const node = nodeRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLoadFull(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px", threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [photoId, loadFull]);

  return {
    nodeRef,
    thumbSrc,
    fullSrc,
    displaySrc: fullSrc ?? thumbSrc,
    hasFull: Boolean(fullSrc),
  };
}

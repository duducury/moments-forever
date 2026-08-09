"use client";

import { useEffect, useRef, useState } from "react";

import { useLocalPhotoObjectUrl } from "./use-local-photo-urls";

/**
 * Thumbnail first, then full when the element enters (or approaches) the viewport.
 * Object URLs come from the session cache (see local-photo-object-url-cache).
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

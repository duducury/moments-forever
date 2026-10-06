import { useEffect, useRef } from "react";

/**
 * Calls `onVisible` once, the first time the element scrolls near the screen —
 * so thumbnails are only requested from the phone for cards the person can see.
 */
export function useVisibleOnce<T extends HTMLElement>(onVisible: () => void) {
  const ref = useRef<T | null>(null);
  const latest = useRef(onVisible);
  useEffect(() => {
    latest.current = onVisible;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      latest.current();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          latest.current();
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return ref;
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./memories-motion.module.css";

// Where in the viewport the fly-in plays: 0 when a photo's top edge reaches
// the bottom of the screen, 1 once it has climbed to this fraction of it.
const END_VIEWPORT_FRACTION = 0.45;
// Photos later in reading order start a little further up, so ones that sit
// side by side don't all land in the same instant.
const STAGGER_PER_ORDER = 0.025;

/**
 * Scroll-linked fly-in for the photos inside it: every `[data-fly]` element
 * slides in from its side as the page scrolls (no pinning, fully reversible).
 * It only writes a `--fly-p` (0 → 1) variable per photo; the transform lives
 * in memories-motion.module.css. Also clips horizontal overflow at the
 * viewport edge so off-screen photos never widen the page.
 */
export function MemoriesMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-fly]")).map(
      (element) => ({
        element,
        order: Number(element.dataset.flyOrder ?? 0),
        last: "",
      }),
    );

    let frame = 0;
    const render = () => {
      frame = 0;
      const viewport = window.innerHeight;
      for (const item of items) {
        const shift = item.order * viewport * STAGGER_PER_ORDER;
        const start = viewport - shift;
        const end = viewport * END_VIEWPORT_FRACTION - shift;
        const top = item.element.getBoundingClientRect().top;
        const linear = Math.min(1, Math.max(0, (start - top) / (start - end)));
        const value = (1 - Math.pow(1 - linear, 3)).toFixed(3);
        if (value !== item.last) {
          item.last = value;
          item.element.style.setProperty("--fly-p", value);
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    render();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}

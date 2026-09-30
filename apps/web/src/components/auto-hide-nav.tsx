"use client";

import { useEffect } from "react";

/** Ignore scroll noise right at the top — never hide the nav there. */
const REVEAL_ZONE_PX = 24;
/** Ignore tiny/inertia deltas so a shaky scroll doesn't flicker the nav. */
const DIRECTION_THRESHOLD_PX = 6;

/**
 * Hides the top nav (.topbar, and the homepage's own .header) while
 * scrolling down, and reveals it again on any upward scroll — via a single
 * `<html data-nav-hidden>` attribute the CSS reacts to. One listener here
 * covers every page instead of wiring this per page: `.topbar` is plain
 * markup repeated across many page files, not one shared component.
 */
export function AutoHideNavOnScroll() {
  useEffect(() => {
    let lastY = window.scrollY;
    let hidden = false;
    let ticking = false;

    function apply(nextHidden: boolean) {
      if (nextHidden === hidden) return;
      hidden = nextHidden;
      document.documentElement.dataset.navHidden = hidden ? "true" : "false";
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        if (y <= REVEAL_ZONE_PX) {
          apply(false);
        } else if (delta > DIRECTION_THRESHOLD_PX) {
          apply(true);
        } else if (delta < -DIRECTION_THRESHOLD_PX) {
          apply(false);
        }
        lastY = y;
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      delete document.documentElement.dataset.navHidden;
    };
  }, []);

  return null;
}

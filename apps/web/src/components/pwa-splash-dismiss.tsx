"use client";

import { useEffect } from "react";

/** Removes the inline boot splash after the first client paint. */
export function PwaSplashDismiss() {
  useEffect(() => {
    const splash = document.getElementById("pwa-boot-splash");
    if (!splash) {
      return;
    }

    const remove = () => {
      splash.style.opacity = "0";
      splash.style.transition = "opacity 0.25s ease";
      window.setTimeout(() => splash.remove(), 260);
    };

    // Two frames so the route shell can paint under the splash first.
    requestAnimationFrame(() => {
      requestAnimationFrame(remove);
    });
  }, []);

  return null;
}

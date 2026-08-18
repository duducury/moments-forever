"use client";

import { useEffect } from "react";

/** Fades out the inline HTML splash after the route shell can paint. */
export function PwaSplashDismiss() {
  useEffect(() => {
    const splash = document.getElementById("pwa-boot-splash");
    if (!splash) return;

    let timeoutId = 0;
    const remove = () => {
      splash.style.opacity = "0";
      splash.style.transition = "opacity 0.28s ease";
      timeoutId = window.setTimeout(() => splash.remove(), 280);
    };

    const start = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(remove);
      });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }

    return () => {
      document.removeEventListener("DOMContentLoaded", start);
      window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}

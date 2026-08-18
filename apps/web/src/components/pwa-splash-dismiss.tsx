"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const BOOT_READY_EVENT = "mf-boot-ready";

export function signalPwaBootReady() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BOOT_READY_EVENT));
}

function hideSplash(splash: HTMLElement) {
  if (splash.dataset.dismissed === "true") return;
  splash.dataset.dismissed = "true";
  splash.style.opacity = "0";
  splash.style.pointerEvents = "none";
  splash.style.transition = "opacity 0.28s ease";
  if (document.documentElement.dataset.resolvedTheme === "light") {
    document.documentElement.style.backgroundColor = "#e8e0d4";
    document.documentElement.style.color = "#1a1612";
  }
  window.setTimeout(() => splash.remove(), 280);
}

/**
 * Hold the brand splash until the destination UI signals ready.
 * /{nome} from the iPhone Home Screen waits on profile data — do not hide
 * on the first paint or the user sees a blank page.
 */
export function PwaSplashDismiss() {
  const pathname = usePathname();

  useEffect(() => {
    const splash = document.getElementById("pwa-boot-splash");
    if (!splash) return;

    const hide = () => hideSplash(splash);
    window.addEventListener(BOOT_READY_EVENT, hide);
    const failsafe = window.setTimeout(hide, 12000);

    return () => {
      window.removeEventListener(BOOT_READY_EVENT, hide);
      window.clearTimeout(failsafe);
    };
  }, [pathname]);

  return null;
}

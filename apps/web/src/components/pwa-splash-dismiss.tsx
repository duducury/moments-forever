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
  splash.setAttribute("aria-hidden", "true");
  splash.removeAttribute("aria-live");
  splash.removeAttribute("role");
  if (document.documentElement.dataset.resolvedTheme === "light") {
    document.documentElement.style.backgroundColor = "#e8e0d4";
    document.documentElement.style.color = "#1a1612";
  }
  // Never splash.remove(): this node is rendered by React (root layout).
  // Removing it directly from the DOM leaves React's tree pointing at a
  // node that no longer exists, so the next unrelated re-render throws
  // "Failed to execute 'insertBefore'/'removeChild' on 'Node'" and takes
  // the whole page down. Hiding it in place is enough — it's inert.
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

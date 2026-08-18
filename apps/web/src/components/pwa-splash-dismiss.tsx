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

function holdsSplash(pathname: string | null): boolean {
  return pathname === "/login" || pathname === "/perfil";
}

/**
 * Keeps the inline brand splash up while /login and /perfil resolve the
 * session. Other routes hide it after the first full load.
 */
export function PwaSplashDismiss() {
  const pathname = usePathname();

  useEffect(() => {
    const splash = document.getElementById("pwa-boot-splash");
    if (!splash) return;

    const hide = () => hideSplash(splash);
    window.addEventListener(BOOT_READY_EVENT, hide);

    const failsafeMs = holdsSplash(pathname) ? 12000 : 4000;
    const failsafe = window.setTimeout(hide, failsafeMs);

    let loadTimer = 0;
    if (!holdsSplash(pathname)) {
      const onLoad = () => {
        loadTimer = window.setTimeout(hide, 120);
      };
      if (document.readyState === "complete") {
        onLoad();
      } else {
        window.addEventListener("load", onLoad, { once: true });
      }
    }

    return () => {
      window.removeEventListener(BOOT_READY_EVENT, hide);
      window.clearTimeout(failsafe);
      window.clearTimeout(loadTimer);
    };
  }, [pathname]);

  return null;
}

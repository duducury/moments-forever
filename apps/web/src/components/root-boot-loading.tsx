"use client";

import { usePathname } from "next/navigation";

import { AlbumLoadingShell } from "./album-loading-shell";
import { AppBootSplash } from "./app-boot-splash";

/**
 * Root loading fallback. Most routes get the generic branded splash, but a
 * link that opens straight into a trip album (/n/<token> redirects to one)
 * shows the album-shaped shell right away — the same shell the album route
 * shows next — so there is a single loading screen across the redirect
 * instead of splash → generic loading → album skeleton.
 */
export function RootBootLoading() {
  const pathname = usePathname();
  if (pathname.startsWith("/n/")) return <AlbumLoadingShell />;
  return <AppBootSplash hint="Abrindo Moments Forever…" />;
}

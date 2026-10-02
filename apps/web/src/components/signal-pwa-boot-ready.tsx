"use client";

import { useEffect } from "react";

import { BOOT_READY_ATTR } from "@/lib/pwa/boot-ready";

import { signalPwaBootReady } from "./pwa-splash-dismiss";

/**
 * Hide the cold-start splash once this route’s UI is on screen.
 *
 * Renders a hidden marker in the server HTML: the inline script in the root
 * layout hides the splash as soon as the marker counts as ready (see
 * lib/pwa/boot-ready.ts) instead of waiting for hydration. Place it AFTER the
 * content that must be visible, or first in the page to wait for the whole
 * document. The effect is the hydration-time fallback.
 */
export function SignalPwaBootReady() {
  useEffect(() => {
    signalPwaBootReady();
  }, []);

  return <span hidden {...{ [BOOT_READY_ATTR]: "" }} />;
}

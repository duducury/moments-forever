"use client";

import { useEffect } from "react";

import { signalPwaBootReady } from "./pwa-splash-dismiss";

/** Hide the cold-start splash once this route’s UI is on screen. */
export function SignalPwaBootReady() {
  useEffect(() => {
    signalPwaBootReady();
  }, []);
  return null;
}

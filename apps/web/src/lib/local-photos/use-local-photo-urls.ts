"use client";

import { useEffect, useState } from "react";

import {
  getOrCreateLocalPhotoObjectUrl,
  peekLocalPhotoObjectUrl,
} from "./local-photo-object-url-cache";
import type { LocalPhotoVariant } from "./photo-blob-store";

/**
 * Resolves IndexedDB photo blobs to Object URLs via a session cache.
 *
 * Reads the cache synchronously when warm (Soft Nav / Admin↔trip) so covers do
 * not flash empty. Never revokes on effect cleanup — that raced with async loads
 * and left dead blob: URLs painted on Admin/Perfil.
 */
export function useLocalPhotoObjectUrl(
  photoId: string | null | undefined,
  variant: LocalPhotoVariant = "thumbnail",
): string | null {
  const warm =
    photoId != null && photoId !== ""
      ? peekLocalPhotoObjectUrl(photoId, variant)
      : null;
  const [, setEpoch] = useState(0);

  useEffect(() => {
    if (!photoId) return;
    if (peekLocalPhotoObjectUrl(photoId, variant)) return;

    let alive = true;
    void getOrCreateLocalPhotoObjectUrl(photoId, variant).then((url) => {
      if (!alive || !url) return;
      setEpoch((value) => value + 1);
    });

    return () => {
      alive = false;
    };
  }, [photoId, variant]);

  if (!photoId) return null;
  return peekLocalPhotoObjectUrl(photoId, variant) ?? warm;
}

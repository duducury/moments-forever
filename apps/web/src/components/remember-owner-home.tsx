"use client";

import { useEffect } from "react";

import {
  isSafeOwnerHomePath,
  ownerHomeCacheKey,
  serializeOwnerHomeCache,
} from "@/lib/pwa/owner-home-cache";

/** Remember the owner’s public profile path so the PWA can reopen it without waiting. */
export function RememberOwnerHome({
  path,
  userId,
}: {
  readonly path: string;
  readonly userId: string;
}) {
  useEffect(() => {
    if (!userId || !isSafeOwnerHomePath(path)) return;
    try {
      window.localStorage.setItem(
        ownerHomeCacheKey(),
        serializeOwnerHomeCache({ path, userId }),
      );
    } catch {
      // Private mode / quota — opening still works via /api/me/entry.
    }
  }, [path, userId]);

  return null;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  ownerHomeCacheKey,
  readOwnerHomeCache,
} from "@/lib/pwa/owner-home-cache";

/**
 * Client redirect keeps /perfil paintable immediately.
 * A server redirect() blocked the first HTML and left the iPhone PWA white.
 */
export function PerfilEntryRedirect() {
  const router = useRouter();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    try {
      const cached = readOwnerHomeCache(
        window.localStorage.getItem(ownerHomeCacheKey()),
        user.id,
      );
      if (cached) {
        router.replace(cached);
        return;
      }
    } catch {
      // Fall through to the server lookup.
    }

    let cancelled = false;

    void fetch("/api/me/entry", { credentials: "include" })
      .then(async (response) => {
        if (cancelled) return;
        const payload = (await response.json()) as {
          readonly redirect?: string;
        };
        router.replace(payload.redirect ?? "/login");
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/login");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loading, router, user]);

  return null;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Client redirect keeps /perfil paintable immediately (loading shell first).
 * Server-side redirect() blocked HTML and caused a long white screen on iOS PWA.
 */
export function PerfilEntryRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/me/entry", { credentials: "include" })
      .then(async (response) => {
        if (cancelled) return;
        const payload = (await response.json()) as { readonly redirect?: string };
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
  }, [router]);

  return null;
}

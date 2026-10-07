"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { canShareNatively, shareLink } from "@/lib/share/share-link";

/** On an album page this resolves the short /a/{code} link; anything else
 * (not the owner, no short link, request failed) falls back to the full URL. */
async function resolveShareUrl(albumId: string | undefined): Promise<string> {
  if (albumId) {
    try {
      const response = await fetch(`/api/albums/${albumId}/short-link`);
      if (response.ok) {
        const payload = (await response.json()) as { readonly url?: string };
        if (payload.url) return payload.url;
      }
    } catch {
      // Fall through to the full URL.
    }
  }
  return window.location.href;
}

const subscribeNever = () => () => {};

/** Server and first client render say "no" (so hydration matches); then the real answer. */
function useCanShareNatively(): boolean {
  return useSyncExternalStore(subscribeNever, () => canShareNatively(), () => false);
}

/**
 * Shares the current page URL: the system share sheet when available (iPhone,
 * most mobile browsers), copying the link otherwise. Also needed in
 * standalone/PWA mode where Safari’s address bar is not available.
 */
export function CopyPageLinkButton({
  albumId,
}: {
  /** On an album page, share that album's short /a/{code} link instead. */
  readonly albumId?: string;
} = {}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The album's short link, fetched ahead of the tap so the share sheet can open
  // inside the tap's user gesture (iOS refuses it after an await on the network).
  const albumUrlRef = useRef<string | null>(null);
  const canShare = useCanShareNatively();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    albumUrlRef.current = null;
    if (!albumId) return;
    let alive = true;
    void resolveShareUrl(albumId).then((url) => {
      if (alive) albumUrlRef.current = url;
    });
    return () => {
      alive = false;
    };
  }, [albumId]);

  async function shareCurrentUrl() {
    const url = albumId
      ? (albumUrlRef.current ?? (await resolveShareUrl(albumId)))
      : window.location.href;
    const result = await shareLink({
      url,
      title: albumId ? "Viagem no Moments Forever" : "Moments Forever",
      text: albumId
        ? "Veja esta viagem no Moments Forever."
        : "Veja esta página no Moments Forever.",
    });
    if (result === "copied") {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } else if (result === "failed") {
      setCopied(false);
      window.prompt("Copia o link:", url);
    }
    // "shared" / "cancelled": the system sheet already handled it, nothing to show.
  }

  return (
    <button
      aria-label={
        copied
          ? "Link copiado"
          : canShare
            ? "Compartilhar link desta página"
            : "Copiar link desta página"
      }
      className="copy-page-link"
      data-copied={copied ? "true" : "false"}
      onClick={() => {
        void shareCurrentUrl();
      }}
      title={copied ? "Link copiado" : canShare ? "Compartilhar" : "Copiar link"}
      type="button"
    >
      {copied ? (
        <span className="copy-page-link-label">Copiado</span>
      ) : (
        <svg
          aria-hidden="true"
          className="copy-page-link-icon"
          fill="none"
          height="20"
          viewBox="0 0 24 24"
          width="20"
        >
          <path
            d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07l-1.1 1.1"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="M14 11a5 5 0 0 0-7.54-.54L4.54 12.38a5 5 0 0 0 7.07 7.07l1.1-1.1"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      )}
    </button>
  );
}

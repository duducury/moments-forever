"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copies the current page URL — needed in standalone/PWA mode where Safari’s
 * address bar (and share sheet) are not available.
 */
export function CopyPageLinkButton() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copyCurrentUrl() {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        document.body.removeChild(field);
      }
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      window.prompt("Copia o link:", url);
    }
  }

  return (
    <button
      aria-label={copied ? "Link copiado" : "Copiar link desta página"}
      className="copy-page-link"
      data-copied={copied ? "true" : "false"}
      onClick={() => {
        void copyCurrentUrl();
      }}
      title={copied ? "Link copiado" : "Copiar link"}
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

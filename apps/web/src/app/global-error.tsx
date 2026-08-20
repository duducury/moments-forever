"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown by the root layout itself (rare —
 * app/error.tsx catches everything else). Must render its own <html>/<body>
 * since the root layout is what failed. Kept dependency-free and inline
 * styled so it can never itself fail to render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#121110",
          color: "#f3efe8",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <p style={{ fontWeight: 750, fontSize: 20, marginBottom: 8 }}>
            Moments Forever
          </p>
          <p style={{ opacity: 0.8, marginBottom: 24 }}>
            Algo não carregou. Verifique sua conexão e tente novamente.
          </p>
          <button
            onClick={() => reset()}
            style={{
              minHeight: 48,
              padding: "0 22px",
              borderRadius: 999,
              border: "none",
              background: "#d08a6e",
              color: "white",
              fontWeight: 750,
              cursor: "pointer",
            }}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}

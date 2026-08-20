"use client";

import Link from "next/link";
import { useEffect } from "react";

import { AppWordmark } from "@/components/app-wordmark";

/**
 * Catches render/data errors anywhere below the root layout.
 * Without this boundary an uncaught error left the screen blank — on the
 * iPhone Home Screen app that surfaces as WKWebView's native
 * "This page couldn't load" instead of something the user can recover from.
 */
export default function RouteError({
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
    <main className="page-shell">
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
      </nav>
      <article className="narrow" style={{ textAlign: "center" }}>
        <h1>Algo não carregou</h1>
        <p className="placeholder-note">
          Tivemos um problema ao carregar esta página. Verifique sua conexão
          e tente novamente.
        </p>
        {/* Temporary diagnostic detail — remove once root-caused. Client
            errors keep their real message (only Server Component errors get
            redacted to a digest), so this is safe to show. */}
        <p
          style={{
            marginTop: 12,
            fontSize: 13,
            opacity: 0.6,
            wordBreak: "break-word",
          }}
        >
          {error.message || "(sem mensagem)"}
          {error.digest ? ` · digest: ${error.digest}` : ""}
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            marginTop: 24,
            flexWrap: "wrap",
          }}
        >
          <button className="button primary" onClick={() => reset()} type="button">
            Tentar novamente
          </button>
          <Link className="button secondary" href="/perfil">
            Voltar ao início
          </Link>
        </div>
      </article>
    </main>
  );
}

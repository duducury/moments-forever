"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth-provider";
import { profilePath } from "@/lib/routes/app-routes";

export function HomePrimaryCta({
  className,
  secondaryClassName,
}: {
  readonly className?: string;
  readonly secondaryClassName?: string;
}) {
  const { loading, user } = useAuth();
  const primaryHref = user ? profilePath() : "/login";
  const primaryLabel = user ? "Ir para meu perfil" : "Criar minha coleção";

  return (
    <div className={className}>
      <Link className="button primary" href={primaryHref}>
        {loading ? "Carregando…" : primaryLabel}
      </Link>
      {!user && !loading ? (
        <Link className={`button secondary ${secondaryClassName ?? ""}`} href="/login">
          Entrar
        </Link>
      ) : null}
    </div>
  );
}

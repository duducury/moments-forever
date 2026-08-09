"use client";

import Link from "next/link";

import { displayNameFromUser } from "@/lib/auth/display-name";
import { profilePath } from "@/lib/routes/app-routes";

import { useAuth } from "./auth-provider";
import { ThemeSelector } from "./theme-selector";

export function AuthStatus() {
  const { loading, user, signOut } = useAuth();

  if (loading) {
    return (
      <div className="auth-actions">
        <ThemeSelector />
        <span className="text-link">Carregando…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-actions">
        <ThemeSelector />
        <Link className="text-link" href="/login">
          Entrar
        </Link>
      </div>
    );
  }

  const name = displayNameFromUser(user);

  return (
    <div className="auth-actions">
      <Link className="nav-user-name" href={profilePath()} title="Meu perfil">
        {name}
      </Link>
      <Link className="text-link" href="/privacidade">
        Privacidade
      </Link>
      <ThemeSelector />
      <button
        className="link-button"
        onClick={() => void signOut()}
        type="button"
      >
        Sair
      </button>
    </div>
  );
}

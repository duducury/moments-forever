"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { AppWordmark } from "@/components/app-wordmark";
import { useAuth } from "@/components/auth-provider";
import { ThemeSelector } from "@/components/theme-selector";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { isOAuthReturn } from "@/lib/auth/oauth-return";
import { profilePath } from "@/lib/routes/app-routes";

import styles from "./home.module.css";

export function HomeHeader() {
  const { loading, user, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const cameFromOAuth = useRef(false);

  // Coming back from "Entrar com Google" onto the landing page (see
  // lib/auth/oauth-return.ts): once the session is in, go to the profile.
  // Read the URL on mount — the auth client strips `code` after exchanging it.
  useEffect(() => {
    cameFromOAuth.current = isOAuthReturn(window.location.search);
  }, []);

  useEffect(() => {
    if (!loading && user && cameFromOAuth.current) {
      cameFromOAuth.current = false;
      router.replace("/perfil");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const name = user ? displayNameFromUser(user) : null;

  return (
    <header className={styles.header} ref={rootRef}>
      <AppWordmark className={`wordmark ${styles.headerWordmark}`} />

      <nav aria-label="Conta" className={styles.headerNav}>
        {loading ? (
          <span className={styles.headerMuted}>Carregando…</span>
        ) : user ? (
          <>
            <Link
              className={styles.headerUser}
              href={profilePath()}
              title="Meu perfil"
            >
              {name}
            </Link>
            <span className={styles.headerTheme}>
              <ThemeSelector />
            </span>
            <button
              className={styles.headerLinkDesktop}
              onClick={() => void signOut()}
              type="button"
            >
              Sair
            </button>
            <button
              aria-controls={menuId}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
              className={styles.headerMenuButton}
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              <span aria-hidden="true" className={styles.headerMenuIcon} />
            </button>
          </>
        ) : (
          <>
            <span className={styles.headerTheme}>
              <ThemeSelector />
            </span>
            <Link className={styles.headerLink} href="/login">
              Entrar
            </Link>
          </>
        )}
      </nav>

      {user && menuOpen ? (
        <div className={styles.headerMenu} id={menuId} role="menu">
          <Link
            className={styles.headerMenuItem}
            href={profilePath()}
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            Meu perfil
          </Link>
          <button
            className={styles.headerMenuItem}
            onClick={() => {
              setMenuOpen(false);
              void signOut();
            }}
            role="menuitem"
            type="button"
          >
            Sair
          </button>
        </div>
      ) : null}
    </header>
  );
}

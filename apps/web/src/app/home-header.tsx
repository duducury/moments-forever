"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { AppWordmark } from "@/components/app-wordmark";
import { useAuth } from "@/components/auth-provider";
import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import { ThemeSelector } from "@/components/theme-selector";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { profilePath } from "@/lib/routes/app-routes";

import styles from "./home.module.css";

export function HomeHeader() {
  const { loading, user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLElement | null>(null);

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
      <SignalPwaBootReady />
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
            <Link className={styles.headerLinkDesktop} href="/privacidade">
              Privacidade
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
          <Link
            className={styles.headerMenuItem}
            href="/privacidade"
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            Privacidade
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

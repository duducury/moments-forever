"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth-provider";

import styles from "./home.module.css";

export function HomeFooterNav() {
  const { loading, user } = useAuth();

  return (
    <nav aria-label="Rodapé" className={styles.footerNav}>
      {user && !loading ? (
        <Link className={styles.footerLink} href="/">
          Início
        </Link>
      ) : null}
      <Link className={styles.footerLink} href="/privacidade">
        Privacidade
      </Link>
      <Link className={styles.footerLink} href="/login">
        Entrar
      </Link>
    </nav>
  );
}

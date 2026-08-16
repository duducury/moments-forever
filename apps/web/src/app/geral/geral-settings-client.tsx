"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AppCreditFooter } from "@/components/app-credit-footer";
import { useAuth } from "@/components/auth-provider";
import { useTheme } from "@/components/theme-provider";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { toggleThemePreference } from "@/lib/theme/theme";

import styles from "./geral.module.css";

export function GeralSettingsClient() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const name = user ? displayNameFromUser(user) : null;
  const nextTheme = toggleThemePreference(preference);
  const themeLabel =
    nextTheme === "dark" ? "Ativar tema escuro" : "Ativar tema claro";
  const themeIcon = preference === "light" ? "🌙" : "☀️";
  const themeHint =
    preference === "light"
      ? "Claro · toque para escuro"
      : "Escuro · toque para claro";

  async function onSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <section className={styles.page} data-reveal>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Conta</p>
        <h1 className={styles.title}>Geral</h1>
        {name ? (
          <p className={styles.lead}>Olá, {name}. Ajustes da conta e do app.</p>
        ) : (
          <p className={styles.lead}>Ajustes da conta e do app.</p>
        )}
      </header>

      <p className={styles.sectionLabel}>Preferências</p>
      <ul className={styles.list}>
        <li>
          <button
            aria-label={themeLabel}
            className={styles.row}
            onClick={() => setPreference(nextTheme)}
            type="button"
          >
            <div className={styles.rowMeta}>
              <p className={styles.rowLabel}>Tema</p>
              <p className={styles.rowHint}>{themeHint}</p>
            </div>
            <span aria-hidden className={styles.rowAction}>
              {themeIcon}
            </span>
          </button>
        </li>
      </ul>

      <p className={styles.sectionLabel}>Privacidade</p>
      <ul className={styles.list}>
        <li>
          <Link className={styles.row} href="/privacidade">
            <div className={styles.rowMeta}>
              <p className={styles.rowLabel}>Privacidade</p>
              <p className={styles.rowHint}>
                Remover localização das fotos
              </p>
            </div>
            <span aria-hidden className={styles.rowAction}>
              ›
            </span>
          </Link>
        </li>
      </ul>

      <p className={styles.sectionLabel}>Sessão</p>
      <ul className={styles.list}>
        <li>
          <button
            className={`${styles.row} ${styles.danger}`}
            onClick={() => void onSignOut()}
            type="button"
          >
            <div className={styles.rowMeta}>
              <p className={styles.rowLabel}>Sair</p>
              <p className={styles.rowHint}>Encerrar sessão neste aparelho</p>
            </div>
          </button>
        </li>
      </ul>

      <footer>
        <AppCreditFooter />
      </footer>
    </section>
  );
}

import Link from "next/link";

import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import { ThemeSelector } from "@/components/theme-selector";

import { ActivationForm } from "./activation-form";
import styles from "./ativar.module.css";

export default function AtivarPage() {
  return (
    <main className={`page-shell ${styles.page}`}>
      <SignalPwaBootReady />
      <nav className="topbar" aria-label="Navegação">
        <Link className="wordmark" href="/">
          Moments Forever
        </Link>
        <div className="auth-actions">
          <ThemeSelector />
          <Link className="text-link" href="/login">
            Entrar
          </Link>
        </div>
      </nav>
      <section className={styles.stage}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className={styles.mark}
          height={88}
          src="/brand/apple-touch-icon.png"
          width={88}
        />
        <h1>Ative sua conta</h1>
        <p className="lead">
          Receba seu código junto com seu pacote Moments Forever.
        </p>
        <ActivationForm />
      </section>
    </main>
  );
}

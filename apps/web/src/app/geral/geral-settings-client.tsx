"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppCreditFooter } from "@/components/app-credit-footer";
import { useAuth } from "@/components/auth-provider";
import { useTheme } from "@/components/theme-provider";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { toggleThemePreference } from "@/lib/theme/theme";

import styles from "./geral.module.css";

interface OptimizeBatchResult {
  readonly processed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly bytesBefore: number;
  readonly bytesAfter: number;
  readonly remaining: boolean;
  readonly errors: readonly string[];
}

const MAX_OPTIMIZE_ROUNDS = 500;

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GeralSettingsClient() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const [optimizeStatus, setOptimizeStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [optimizeHint, setOptimizeHint] = useState(
    "Reduz fotos antigas enviadas antes das melhorias de compressão",
  );
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

  async function onOptimizePhotos() {
    setOptimizeStatus("running");
    let processedTotal = 0;
    let bytesBeforeTotal = 0;
    let bytesAfterTotal = 0;
    let round = 0;

    try {
      while (round < MAX_OPTIMIZE_ROUNDS) {
        round++;
        const response = await fetch("/api/media/optimize-legacy", {
          method: "POST",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Falha ao otimizar (${response.status}).`);
        }
        const result = (await response.json()) as OptimizeBatchResult;
        processedTotal += result.processed;
        bytesBeforeTotal += result.bytesBefore;
        bytesAfterTotal += result.bytesAfter;

        if (processedTotal > 0) {
          setOptimizeHint(
            `Otimizando… ${processedTotal} fotos reduzidas, ${formatMegabytes(
              bytesBeforeTotal - bytesAfterTotal,
            )} economizados até agora`,
          );
        }

        // No progress this round (only unfixable photos left) — stop instead
        // of retrying the same ones forever.
        if (result.processed === 0) break;
        if (!result.remaining) break;
      }

      setOptimizeStatus("done");
      setOptimizeHint(
        processedTotal > 0
          ? `Concluído: ${processedTotal} fotos reduzidas, ${formatMegabytes(
              bytesBeforeTotal - bytesAfterTotal,
            )} economizados`
          : "Nenhuma foto precisava de otimização",
      );
    } catch (err) {
      setOptimizeStatus("error");
      setOptimizeHint(
        err instanceof Error ? err.message : "Erro ao otimizar fotos.",
      );
    }
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

      <p className={styles.sectionLabel}>Armazenamento</p>
      <ul className={styles.list}>
        <li>
          <button
            aria-label="Otimizar fotos antigas"
            className={styles.row}
            disabled={optimizeStatus === "running"}
            onClick={() => void onOptimizePhotos()}
            type="button"
          >
            <div className={styles.rowMeta}>
              <p className={styles.rowLabel}>Otimizar fotos antigas</p>
              <p className={styles.rowHint}>{optimizeHint}</p>
            </div>
            <span aria-hidden className={styles.rowAction}>
              {optimizeStatus === "running" ? "…" : "›"}
            </span>
          </button>
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

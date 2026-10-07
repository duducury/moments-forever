"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppCreditFooter } from "@/components/app-credit-footer";
import { useAuth } from "@/components/auth-provider";
import { useTheme } from "@/components/theme-provider";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { toggleThemePreference } from "@/lib/theme/theme";

import { DeleteAccountSection } from "./delete-account-section";
import { EditProfileDialog } from "../perfil/edit-profile-dialog";
import { DEFAULT_BIO } from "../perfil/profile-header";
import { ProfileAvatar } from "../perfil/profile-avatar";
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

function ThemeIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function NfcIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M8 15.5a4.5 4.5 0 0 1 8 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M5.2 12.7a8.2 8.2 0 0 1 13.6 0"
        opacity="0.55"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="18.3" fill="currentColor" r="1.3" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="8.5" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M11 11 20 20M16.5 15.5 19 13M14 18l2-2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <rect
        height="10"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.6"
        width="14"
        x="5"
        y="10.5"
      />
      <path
        d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function PhotosIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <rect
        height="12.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
        width="15"
        x="4.5"
        y="7"
      />
      <circle cx="9.2" cy="11.3" r="1.35" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="m6.5 17 4-3.6 2.6 2.2 3-3.1 2.4 2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path
        d="M12 3 5 6v5.5c0 4.1 2.8 7.6 7 9 4.2-1.4 7-4.9 7-9V6l-7-3Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="m9.2 12 2 2 3.6-3.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function GeralSettingsClient({
  avatarPhotoId = null,
  avatarRemoteSrc = null,
  isAdmin = false,
  ownerId = "",
  profileBio = null,
  profileName = "",
}: {
  readonly avatarPhotoId?: string | null;
  readonly avatarRemoteSrc?: string | null;
  /** Decided on the server (see page.tsx); the admin entry is not rendered at all when false. */
  readonly isAdmin?: boolean;
  readonly ownerId?: string;
  readonly profileBio?: string | null;
  readonly profileName?: string;
} = {}) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const [editProfileOpen, setEditProfileOpen] = useState(false);
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
      <h1 className={styles.srOnlyTitle}>Geral</h1>

      <p className={styles.sectionLabel}>Conta</p>
      <ul className={styles.list}>
        <li>
          <button
            aria-label="Editar perfil"
            className={styles.accountCard}
            onClick={() => setEditProfileOpen(true)}
            type="button"
          >
            <ProfileAvatar
              avatarPhotoId={avatarPhotoId}
              displayName={name ?? "Você"}
              ownerId={user?.id ?? ""}
              remoteSrc={avatarRemoteSrc}
              size="md"
            />
            <div className={styles.accountMeta}>
              <p className={styles.accountName}>{name ?? "Sua conta"}</p>
              <p className={styles.accountHint}>Toque para editar seu perfil.</p>
            </div>
            <span aria-hidden className={styles.rowAction}>
              ›
            </span>
          </button>
        </li>
      </ul>

      {isAdmin ? (
        <>
          <p className={styles.sectionLabel}>Administração</p>
          <ul className={styles.list}>
            <li>
              <Link className={styles.row} href="/admin">
                <span className={styles.rowIcon} data-tone="premium">
                  <AdminIcon />
                </span>
                <div className={styles.rowMeta}>
                  <p className={styles.rowLabel}>Administração</p>
                  <p className={styles.rowHint}>
                    Usuários, planos, códigos e denúncias
                  </p>
                </div>
                <span aria-hidden className={styles.rowAction}>
                  ›
                </span>
              </Link>
            </li>
          </ul>
        </>
      ) : null}

      <p className={styles.sectionLabel}>Preferências</p>
      <ul className={styles.list}>
        <li>
          <button
            aria-label={themeLabel}
            className={styles.row}
            onClick={() => setPreference(nextTheme)}
            type="button"
          >
            <span className={styles.rowIcon} data-tone="neutral">
              <ThemeIcon />
            </span>
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

      <p className={styles.sectionLabel}>Tags NFC</p>
      <ul className={styles.list}>
        <li>
          <Link className={styles.row} href="/geral/nfc">
            <span className={styles.rowIcon} data-tone="info">
              <NfcIcon />
            </span>
            <div className={styles.rowMeta}>
              <p className={styles.rowLabel}>Ativar NFC</p>
              <p className={styles.rowHint}>
                Vincule uma viagem a uma tag e copie o link para gravá-la
              </p>
            </div>
            <span aria-hidden className={styles.rowAction}>
              ›
            </span>
          </Link>
        </li>
      </ul>

      <p className={styles.sectionLabel}>Licença</p>
      <ul className={styles.list}>
        <li>
          <Link className={styles.row} href="/ativar">
            <span className={styles.rowIcon} data-tone="gold">
              <KeyIcon />
            </span>
            <div className={styles.rowMeta}>
              <p className={styles.rowLabel}>Ativar código</p>
              <p className={styles.rowHint}>
                Comprou mais tags NFC? Ative o código aqui.
              </p>
            </div>
            <span aria-hidden className={styles.rowAction}>
              ›
            </span>
          </Link>
        </li>
      </ul>

      <p className={styles.sectionLabel}>Privacidade</p>
      <ul className={styles.list}>
        <li>
          <Link className={styles.row} href="/privacidade">
            <span className={styles.rowIcon} data-tone="danger">
              <LockIcon />
            </span>
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
            <span className={styles.rowIcon} data-tone="premium">
              <PhotosIcon />
            </span>
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

      <p className={styles.sectionLabel}>Zona de perigo</p>
      <ul className={styles.list}>
        <li>
          <DeleteAccountSection />
        </li>
      </ul>

      <footer>
        <AppCreditFooter />
      </footer>

      {/* The same editor the profile home opens from "Editar". */}
      {editProfileOpen && ownerId ? (
        <EditProfileDialog
          initialBio={profileBio?.trim() || DEFAULT_BIO}
          initialName={profileName || name || ""}
          onClose={() => setEditProfileOpen(false)}
          ownerId={ownerId}
          remoteSrc={avatarRemoteSrc}
        />
      ) : null}
    </section>
  );
}

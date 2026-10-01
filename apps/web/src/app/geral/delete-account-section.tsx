"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import styles from "./geral.module.css";

const CONFIRM_WORD = "EXCLUIR";

/**
 * Self-service account deletion — the "Zona de perigo" row in /geral.
 * Calls DELETE /api/me, which runs delete_own_account() (auth.uid()-scoped,
 * mirrors admin_delete_user()'s cleanup exactly — photos, R2 objects,
 * thumbnails, avatar, NFC tags, activation codes, licenses, experiences,
 * places, moments, albums, then the account itself) and clears the
 * server-side session cookie. This component then also signs out on the
 * client (its own localStorage/session state) before redirecting, since the
 * server round-trip alone doesn't reliably clear that.
 */
export function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setOpen(false);
    setConfirmText("");
    setError(null);
  }

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/me", { method: "DELETE" });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível excluir a conta.");
      }

      const client = createSupabaseBrowserClient();
      await client?.auth.signOut();

      setDone(true);
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao excluir a conta.",
      );
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className={styles.deleteWarning} role="status">
        Sua conta foi excluída. Redirecionando…
      </p>
    );
  }

  if (!open) {
    return (
      <button
        className={`${styles.row} ${styles.danger}`}
        onClick={() => setOpen(true)}
        type="button"
      >
        <div className={styles.rowMeta}>
          <p className={styles.rowLabel}>Excluir minha conta</p>
          <p className={styles.rowHint}>
            Apaga sua conta e todo o seu conteúdo permanentemente
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className={styles.deleteConfirm}>
      <p className={styles.deleteWarning}>
        Isso apaga sua conta permanentemente — todas as suas fotos, viagens,
        álbuns, tags NFC e licença. <strong>Não pode ser desfeito.</strong>
      </p>
      <label htmlFor="confirm-delete-account">
        Digite {CONFIRM_WORD} para confirmar
      </label>
      <input
        autoFocus
        autoComplete="off"
        disabled={busy}
        id="confirm-delete-account"
        onChange={(event) => setConfirmText(event.target.value)}
        value={confirmText}
      />
      <div className={styles.deleteActions}>
        <button
          className={styles.dangerButton}
          disabled={busy || confirmText !== CONFIRM_WORD}
          onClick={() => void onDelete()}
          type="button"
        >
          {busy ? "Excluindo…" : "Excluir permanentemente"}
        </button>
        <button
          className="link-button"
          disabled={busy}
          onClick={reset}
          type="button"
        >
          Cancelar
        </button>
      </div>
      {error ? (
        <p className={styles.deleteWarning} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

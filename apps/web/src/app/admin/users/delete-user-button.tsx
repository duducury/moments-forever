"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "../admin.module.css";

const CONFIRM_WORD = "EXCLUIR";

export function DeleteUserButton({
  userId,
  userLabel,
}: {
  readonly userId: string;
  readonly userLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setConfirmText("");
    setError(null);
  }

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível excluir a conta.");
      }
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir a conta.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        className={styles.dangerLink}
        onClick={() => setOpen(true)}
        type="button"
      >
        Excluir conta
      </button>
    );
  }

  return (
    <div className={styles.deleteConfirm}>
      <p className={styles.deleteWarning}>
        Isso apaga <strong>{userLabel}</strong> permanentemente — todas as
        viagens, fotos e licenças da conta. Não pode ser desfeito.
      </p>
      <label htmlFor={`confirm-delete-${userId}`}>
        Digite {CONFIRM_WORD} para confirmar
      </label>
      <input
        autoFocus
        disabled={busy}
        id={`confirm-delete-${userId}`}
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

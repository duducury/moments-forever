"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { syncLocalPhotosToR2 } from "@/lib/storage/upload-photo-to-r2";

import styles from "./trip.module.css";

interface Props {
  readonly experienceId: string;
  readonly photoIdsMissingStorage: readonly string[];
}

type Phase = "idle" | "running" | "done" | "error";

/**
 * Owner-only: photos visible via IndexedDB on this device but missing R2 keys.
 * Upload from here so other devices (PC) can load `/api/media`.
 */
export function PendingR2Sync({
  experienceId,
  photoIdsMissingStorage,
}: Props) {
  const router = useRouter();
  const autoStartedRef = useRef(false);
  const runningRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const photoIdsKey = photoIdsMissingStorage.join(",");
  const count = photoIdsMissingStorage.length;

  async function runSync() {
    if (!photoIdsKey || runningRef.current) return;
    const ids = photoIdsKey.split(",").filter(Boolean);
    runningRef.current = true;
    setPhase("running");
    setProgress(`A enviar 0 de ${ids.length}…`);
    setStatus(null);

    try {
      const result = await syncLocalPhotosToR2(
        experienceId,
        ids,
        (done, total) => {
          setProgress(`A enviar ${done} de ${total}…`);
        },
      );

      setProgress(null);

      if (result.uploaded > 0) {
        setPhase("done");
        setStatus(
          result.failed > 0
            ? `${result.uploaded} foto(s) na nuvem; ${result.failed} falharam. ${result.lastError ?? ""} Atualiza o PC depois.`
            : `${result.uploaded} foto(s) enviada(s). Já podes ver no PC (atualiza a página).`,
        );
        router.refresh();
        return;
      }

      if (result.failed > 0) {
        setPhase("error");
        setStatus(
          result.lastError ??
            "Não foi possível enviar. Verifica a ligação e tenta de novo.",
        );
        return;
      }

      setPhase("error");
      setStatus(
        "Neste aparelho não há cópia local destas fotos. Abre o álbum no iPhone onde as adicionaste e toca em «Enviar para a nuvem».",
      );
    } finally {
      runningRef.current = false;
    }
  }

  useEffect(() => {
    if (!photoIdsKey || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void runSync();
    // One-shot auto sync when the album opens on the device that still has blobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot
  }, [photoIdsKey, experienceId]);

  if (count === 0) return null;

  return (
    <div className={styles.cloudSyncBanner} role="status">
      <p className={styles.cloudSyncText}>
        {status ??
          (phase === "running"
            ? (progress ?? "A enviar fotos deste aparelho para a nuvem…")
            : `${count} foto(s) só estão neste aparelho. Envia para a nuvem para aparecerem no PC — sem escolher de novo.`)}
      </p>
      {phase !== "running" ? (
        <button
          className={`${styles.albumToolButton} ${styles.albumToolPrimary}`}
          onClick={() => {
            void runSync();
          }}
          type="button"
        >
          {phase === "done" ? "Enviar de novo" : "Enviar para a nuvem"}
        </button>
      ) : null}
    </div>
  );
}

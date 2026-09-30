"use client";

import { useEffect, useState } from "react";

import { useLockPageScroll } from "../../album-ui";
import styles from "../../trip.module.css";
import { buildNfcTagRequestBody } from "@/lib/nfc/album-nfc-link";
import {
  isNativeNfcSupported,
  writeUrlToNfcTagAuto,
} from "@/lib/nfc/native-nfc";
import { isWebNfcSupported } from "@/lib/nfc/web-nfc";

interface Props {
  readonly experienceId: string;
  readonly albumId: string;
  readonly albumTitle: string;
  readonly onClose: () => void;
}

type ViewState =
  | { readonly step: "checking" }
  | { readonly step: "linking" }
  | { readonly step: "writing" }
  | { readonly step: "success" }
  | { readonly step: "created"; readonly url: string }
  | { readonly step: "existing"; readonly url: string }
  | { readonly step: "error"; readonly message: string };

/**
 * "Vincular NFC" for a single root album/destination, opened from inside its
 * own folder — the album already known here (no trip picker, unlike "Ativar
 * NFC"). Reuses the same albumId-keyed API and native-write bridge as that
 * screen; never touches its state.
 */
export function NfcLinkPanel({
  experienceId,
  albumId,
  albumTitle,
  onClose,
}: Props) {
  useLockPageScroll();
  const [state, setState] = useState<ViewState>({ step: "checking" });
  const [copied, setCopied] = useState(false);
  const [canWriteDirectly] = useState(
    () => isWebNfcSupported() || isNativeNfcSupported(),
  );

  async function createLink(): Promise<{ readonly url: string }> {
    const response = await fetch("/api/nfc-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildNfcTagRequestBody({ experienceId, albumId })),
    });
    const payload = (await response.json()) as {
      readonly token?: string;
      readonly url?: string;
      readonly error?: string;
    };
    if (!response.ok || !payload.token || !payload.url) {
      throw new Error(payload.error ?? "Não foi possível criar a tag NFC.");
    }
    return { url: payload.url };
  }

  async function startLinking() {
    setState({ step: "linking" });
    let url: string;
    try {
      const created = await createLink();
      url = created.url;
    } catch (err) {
      setState({
        step: "error",
        message:
          err instanceof Error ? err.message : "Falha ao criar a tag NFC.",
      });
      return;
    }

    if (!canWriteDirectly) {
      setState({ step: "created", url });
      return;
    }

    setState({ step: "writing" });
    try {
      await writeUrlToNfcTagAuto(url);
      setState({ step: "success" });
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Falha ao gravar a tag.",
      });
    }
  }

  async function writeAgain(url: string) {
    setState({ step: "writing" });
    try {
      await writeUrlToNfcTagAuto(url);
      setState({ step: "success" });
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Falha ao gravar a tag.",
      });
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copie o link:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => {
    let alive = true;
    void fetch(
      `/api/nfc-tags?experienceId=${encodeURIComponent(experienceId)}&albumId=${encodeURIComponent(albumId)}`,
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          readonly tag?: { readonly url: string } | null;
          readonly error?: string;
        };
        if (!alive) return;
        if (!response.ok) {
          setState({
            step: "error",
            message: payload.error ?? "Não foi possível verificar a tag.",
          });
          return;
        }
        if (payload.tag?.url) {
          setState({ step: "existing", url: payload.tag.url });
        } else {
          void startLinking();
        }
      })
      .catch(() => {
        if (!alive) return;
        setState({
          step: "error",
          message: "Não foi possível verificar a tag.",
        });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experienceId, albumId]);

  return (
    <div
      aria-label="Vincular NFC"
      aria-modal="true"
      className={`${styles.panel} ${styles.nfcPanelOverlay}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className={styles.panelCard}>
        <p className={styles.panelEyebrow}>NFC</p>
        <h2>Vincular NFC</h2>

        {state.step === "existing" ? (
          <span className={styles.nfcStatusPill}>
            <span aria-hidden="true" className={styles.nfcStatusDot} />
            NFC vinculada
          </span>
        ) : null}

        {state.step === "checking" ? (
          <p className={styles.sectionHint}>Verificando…</p>
        ) : null}

        {state.step === "linking" || state.step === "writing" ? (
          <>
            <p className={styles.sectionHint}>
              Esta tag abrirá diretamente: <strong>{albumTitle}</strong>
            </p>
            <p className={styles.sectionHint}>
              {state.step === "writing"
                ? "Gravando… aproxime uma tag NFC do iPhone."
                : "Criando o link da tag…"}
            </p>
          </>
        ) : null}

        {state.step === "success" ? (
          <>
            <p className={styles.sectionHint}>Tag configurada com sucesso!</p>
            <p className={styles.sectionHint}>
              Esta tag está vinculada a {albumTitle}.
            </p>
          </>
        ) : null}

        {state.step === "created" ? (
          <>
            <p className={styles.sectionHint}>Link criado com sucesso.</p>
            <p className={styles.sectionHint}>
              Copie o link e grave com um leitor NFC de sua preferência.
            </p>
          </>
        ) : null}

        {state.step === "existing" ? (
          <p className={styles.sectionHint}>
            Esta viagem já possui uma tag NFC.
          </p>
        ) : null}

        {state.step === "error" ? (
          <p className={styles.error} role="alert">
            {state.message}
          </p>
        ) : null}

        <div className={styles.panelActions}>
          {state.step === "existing" || state.step === "created" ? (
            <>
              {canWriteDirectly ? (
                <button
                  className="button secondary"
                  onClick={() => void writeAgain(state.url)}
                  type="button"
                >
                  Gravar em nova tag
                </button>
              ) : null}
              <button
                className="button secondary"
                onClick={() => void copyUrl(state.url)}
                type="button"
              >
                {copied ? "Copiado" : "Copiar link"}
              </button>
            </>
          ) : null}
          {state.step === "error" ? (
            <button
              className="button secondary"
              onClick={() => void startLinking()}
              type="button"
            >
              Tentar novamente
            </button>
          ) : null}
          <button className="button secondary" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

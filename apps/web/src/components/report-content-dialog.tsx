"use client";

import { useState } from "react";

import styles from "@/app/trip/[slug]/trip.module.css";

type TargetType = "user" | "experience" | "album" | "photo";
type Reason = "offensive" | "illegal" | "spam" | "inappropriate" | "other";

const REASON_OPTIONS: readonly { readonly value: Reason; readonly label: string }[] = [
  { value: "offensive", label: "Conteúdo ofensivo" },
  { value: "illegal", label: "Conteúdo ilegal" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Conteúdo inadequado" },
  { value: "other", label: "Outro" },
];

type State =
  | { readonly step: "form" }
  | { readonly step: "sending" }
  | { readonly step: "sent" }
  | { readonly step: "error"; readonly message: string };

/**
 * Reusable "Denunciar conteúdo" dialog — same shared panel chrome as
 * NfcLinkPanel (trip.module.css .panel/.panelCard), used both from the
 * public album view and the public profile view. Posts to POST /api/reports,
 * which is the only thing that actually writes anything — this component
 * has no access to other users' data itself.
 */
export function ReportContentDialog({
  targetType,
  targetId,
  title = "Denunciar conteúdo",
  onClose,
}: {
  readonly targetType: TargetType;
  readonly targetId: string;
  readonly title?: string;
  readonly onClose: () => void;
}) {
  const [reason, setReason] = useState<Reason>("offensive");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<State>({ step: "form" });

  async function onSubmit() {
    setState({ step: "sending" });
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          details: details.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível enviar a denúncia.");
      }
      setState({ step: "sent" });
    } catch (err) {
      setState({
        step: "error",
        message:
          err instanceof Error ? err.message : "Não foi possível enviar a denúncia.",
      });
    }
  }

  return (
    <div
      aria-label={title}
      aria-modal="true"
      className={styles.panel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className={styles.panelCard}>
        <h2>{title}</h2>

        {state.step === "sent" ? (
          <>
            <p className={styles.sectionHint}>
              Denúncia enviada. Obrigado por nos ajudar a manter o Moments
              Forever seguro.
            </p>
            <div className={styles.panelActions}>
              <button className="button secondary" onClick={onClose} type="button">
                Fechar
              </button>
            </div>
          </>
        ) : (
          <>
            <fieldset className={styles.addPhotosPlacement}>
              <legend>Motivo</legend>
              {REASON_OPTIONS.map((option) => (
                <label className={styles.addPhotosRadio} key={option.value}>
                  <input
                    checked={reason === option.value}
                    name="report-reason"
                    onChange={() => setReason(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>

            <label htmlFor="report-details">Detalhes (opcional)</label>
            <textarea
              className={styles.textarea}
              id="report-details"
              maxLength={2000}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Conte mais sobre o que você quer denunciar"
              rows={4}
              value={details}
            />

            {state.step === "error" ? (
              <p className={styles.error} role="alert">
                {state.message}
              </p>
            ) : null}

            <div className={styles.panelActions}>
              <button
                className="button primary"
                disabled={state.step === "sending"}
                onClick={() => void onSubmit()}
                type="button"
              >
                {state.step === "sending" ? "Enviando…" : "Enviar denúncia"}
              </button>
              <button
                className="button secondary"
                disabled={state.step === "sending"}
                onClick={onClose}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

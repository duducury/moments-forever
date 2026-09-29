"use client";

import { useEffect, useState } from "react";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import { isNativeNfcSupported, writeUrlToNfcTagAuto } from "@/lib/nfc/native-nfc";
import { isWebNfcSupported } from "@/lib/nfc/web-nfc";

import styles from "./nfc-manager.module.css";

interface TripNfcInfo {
  readonly experienceId: string;
  readonly title: string;
  readonly countryCode: string | null;
  readonly coverPhotoId: string | null;
  readonly photoCount: number;
  readonly nfcToken: string | null;
  readonly nfcUrl: string | null;
}

type WriteState =
  | { readonly tripId: string; readonly status: "writing" }
  | { readonly tripId: string; readonly status: "success" }
  | {
      readonly tripId: string;
      readonly status: "error";
      readonly message: string;
    };

export function NfcManagerClient() {
  const [trips, setTrips] = useState<readonly TripNfcInfo[] | null>(null);
  const [limit, setLimit] = useState<{
    readonly used: number;
    readonly max: number | null;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [writeState, setWriteState] = useState<WriteState | null>(null);
  const [canWriteDirectly] = useState(
    () => isWebNfcSupported() || isNativeNfcSupported(),
  );

  useEffect(() => {
    let alive = true;
    void fetch("/api/me/nfc-tags")
      .then(async (response) => {
        const payload = (await response.json()) as {
          readonly trips?: TripNfcInfo[];
          readonly usedCount?: number;
          readonly maxNfcTags?: number | null;
          readonly error?: string;
        };
        if (!alive) return;
        if (!response.ok) {
          setLoadError(
            payload.error ?? "Não foi possível carregar as viagens.",
          );
          setTrips([]);
          return;
        }
        setTrips(payload.trips ?? []);
        setLimit({
          used: payload.usedCount ?? 0,
          max: payload.maxNfcTags ?? null,
        });
      })
      .catch(() => {
        if (!alive) return;
        setLoadError("Não foi possível carregar as viagens.");
        setTrips([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function linkTrip(tripId: string) {
    setLinkingId(tripId);
    setLoadError(null);
    try {
      const response = await fetch("/api/nfc-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceId: tripId }),
      });
      const payload = (await response.json()) as {
        readonly token?: string;
        readonly url?: string;
        readonly error?: string;
      };
      if (!response.ok || !payload.token || !payload.url) {
        throw new Error(
          payload.error ?? "Não foi possível vincular a tag NFC.",
        );
      }
      const { token, url } = payload;
      setTrips((current) =>
        current
          ? current.map((trip) =>
              trip.experienceId === tripId
                ? { ...trip, nfcToken: token, nfcUrl: url }
                : trip,
            )
          : current,
      );
      setLimit((current) =>
        current ? { ...current, used: current.used + 1 } : current,
      );
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Falha ao vincular a tag NFC.",
      );
    } finally {
      setLinkingId(null);
    }
  }

  async function copyUrl(tripId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copie o link:", url);
    }
    setCopiedId(tripId);
    setTimeout(() => {
      setCopiedId((current) => (current === tripId ? null : current));
    }, 2000);
  }

  async function writeToTag(tripId: string, url: string) {
    setWriteState({ tripId, status: "writing" });
    try {
      await writeUrlToNfcTagAuto(url);
      setWriteState({ tripId, status: "success" });
    } catch (err) {
      setWriteState({
        tripId,
        status: "error",
        message: err instanceof Error ? err.message : "Falha ao gravar a tag.",
      });
    }
  }

  const atLimit = Boolean(
    limit && limit.max !== null && limit.used >= limit.max,
  );

  return (
    <section className={styles.page} data-reveal>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Tags NFC</p>
        <h1 className={styles.title}>Ativar NFC</h1>
        <p className={styles.lead}>
          Escolha uma viagem para copiar o link dela e escrever numa tag NFC
          física — ao encostar o celular, ela abre direto essa viagem.
        </p>
        {canWriteDirectly ? (
          <p className={styles.lead}>
            Seu app grava direto: toque em &ldquo;Gravar na tag&rdquo; e
            aproxime uma tag NFC em branco do celular.
          </p>
        ) : (
          <p className={styles.lead}>
            Este navegador não grava tags NFC diretamente (isso é uma
            limitação do iPhone/Safari, não do app). Copie o link e grave-o
            com um app gratuito como NFC Tools — só precisa fazer isso uma vez
            por tag.
          </p>
        )}
        {limit ? (
          <p className={styles.lead}>
            {limit.max === null
              ? `${limit.used} tags NFC criadas.`
              : `${limit.used} de ${limit.max} tags NFC do seu plano em uso.`}
          </p>
        ) : null}
      </header>

      {trips === null ? (
        <p className={styles.lead}>Carregando suas viagens…</p>
      ) : trips.length === 0 ? (
        <p className={styles.lead}>Você ainda não tem viagens.</p>
      ) : (
        <ul className={styles.list}>
          {trips.map((trip) => {
            const isLinking = linkingId === trip.experienceId;
            const writeForTrip =
              writeState?.tripId === trip.experienceId ? writeState : null;
            return (
              <li className={styles.row} key={trip.experienceId}>
                <ExperienceCoverThumb
                  className={styles.cover}
                  coverPhotoId={trip.coverPhotoId}
                  fallbackClassName={styles.coverFallback}
                  imageClassName={styles.coverImage}
                  title={trip.title}
                  variant="thumbnail"
                />
                <div className={styles.meta}>
                  <div className={styles.titleRow}>
                    {trip.countryCode ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
                      <img
                        alt=""
                        className={styles.flag}
                        decoding="async"
                        height={15}
                        src={`https://flagcdn.com/w40/${trip.countryCode.toLowerCase()}.png`}
                        width={20}
                      />
                    ) : null}
                    <p className={styles.tripTitle}>{trip.title}</p>
                    <span
                      className={styles.statusBadge}
                      data-linked={trip.nfcUrl ? "true" : "false"}
                    >
                      {trip.nfcUrl ? "Vinculada" : "Sem tag"}
                    </span>
                  </div>
                  {trip.nfcUrl ? (
                    <p className={styles.tripHint}>{trip.nfcUrl}</p>
                  ) : (
                    <p className={styles.tripHint}>
                      {trip.photoCount} foto{trip.photoCount === 1 ? "" : "s"}
                    </p>
                  )}
                  {writeForTrip?.status === "writing" ? (
                    <p className={styles.tripHint}>
                      Aproxime uma tag NFC em branco do celular…
                    </p>
                  ) : null}
                  {writeForTrip?.status === "success" ? (
                    <p className={styles.tripHint}>Tag gravada com sucesso!</p>
                  ) : null}
                  {writeForTrip?.status === "error" ? (
                    <p className={styles.error} role="alert">
                      {writeForTrip.message}
                    </p>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  {trip.nfcUrl ? (
                    <>
                      <button
                        className="button secondary"
                        onClick={() =>
                          void copyUrl(trip.experienceId, trip.nfcUrl ?? "")
                        }
                        type="button"
                      >
                        {copiedId === trip.experienceId
                          ? "Copiado"
                          : "Copiar link"}
                      </button>
                      {canWriteDirectly ? (
                        <button
                          className="button secondary"
                          disabled={writeForTrip?.status === "writing"}
                          onClick={() =>
                            void writeToTag(
                              trip.experienceId,
                              trip.nfcUrl ?? "",
                            )
                          }
                          type="button"
                        >
                          {writeForTrip?.status === "writing"
                            ? "Gravando…"
                            : "Gravar na tag"}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <button
                      className="button primary"
                      disabled={isLinking || atLimit}
                      onClick={() => void linkTrip(trip.experienceId)}
                      type="button"
                    >
                      {isLinking ? "Vinculando…" : "Vincular NFC"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {atLimit ? (
        <p className={styles.lead}>
          Você atingiu o limite de {limit?.max} tags NFC do seu plano.
        </p>
      ) : null}

      {loadError ? (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      ) : null}
    </section>
  );
}

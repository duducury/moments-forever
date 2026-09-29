"use client";

import { useEffect, useState } from "react";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import {
  isNativeNfcSupported,
  readNfcTag,
  writeUrlToNfcTagAuto,
} from "@/lib/nfc/native-nfc";
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

/**
 * Per-trip state for the combined "create the link + write it to a physical
 * tag in one tap" flow ({@link configureNewTag}), and for re-writing an
 * existing link onto an additional tag ({@link writeToTag}).
 */
type ConfigureState =
  | { readonly tripId: string; readonly status: "linking" }
  | { readonly tripId: string; readonly status: "writing" }
  | { readonly tripId: string; readonly status: "success" }
  | {
      readonly tripId: string;
      readonly status: "error";
      readonly message: string;
    };

type ReadTestState =
  | { readonly status: "reading" }
  | {
      readonly status: "success";
      readonly url: string | null;
      readonly matchedTitle: string | null;
    }
  | { readonly status: "error"; readonly message: string };

export function NfcManagerClient() {
  const [trips, setTrips] = useState<readonly TripNfcInfo[] | null>(null);
  const [limit, setLimit] = useState<{
    readonly used: number;
    readonly max: number | null;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [configureState, setConfigureState] = useState<ConfigureState | null>(
    null,
  );
  const [readTestState, setReadTestState] = useState<ReadTestState | null>(
    null,
  );
  const [canWriteDirectly] = useState(
    () => isWebNfcSupported() || isNativeNfcSupported(),
  );
  const [canReadNatively] = useState(() => isNativeNfcSupported());

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

  /** Creates the trip's `/n/{token}` link (if it doesn't exist yet). */
  async function createTagLink(
    tripId: string,
  ): Promise<{ readonly token: string; readonly url: string }> {
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
        payload.error ?? "Não foi possível criar a tag NFC.",
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
    return { token, url };
  }

  /**
   * The main "Configurar nova tag NFC" flow: creates the trip's short link,
   * then — when this build can write NFC directly (native app or Web NFC) —
   * immediately starts the write session so the user only has to tap the tag
   * once, never leaving the app. Falls back to just creating the link (for
   * copy + a third-party writer app) when neither is available.
   */
  async function configureNewTag(tripId: string) {
    setLoadError(null);
    setConfigureState({ tripId, status: "linking" });
    let url: string;
    try {
      const created = await createTagLink(tripId);
      url = created.url;
    } catch (err) {
      setConfigureState({
        tripId,
        status: "error",
        message:
          err instanceof Error ? err.message : "Falha ao criar a tag NFC.",
      });
      return;
    }

    if (!canWriteDirectly) {
      // No in-app write path here (plain Safari/iOS browser) — the link is
      // created; the user copies it and writes it with a third-party app.
      setConfigureState(null);
      return;
    }

    setConfigureState({ tripId, status: "writing" });
    try {
      await writeUrlToNfcTagAuto(url);
      setConfigureState({ tripId, status: "success" });
    } catch (err) {
      setConfigureState({
        tripId,
        status: "error",
        message: err instanceof Error ? err.message : "Falha ao gravar a tag.",
      });
    }
  }

  /** Writes an *already-linked* trip's URL onto an additional physical tag. */
  async function writeToTag(tripId: string, url: string) {
    setConfigureState({ tripId, status: "writing" });
    try {
      await writeUrlToNfcTagAuto(url);
      setConfigureState({ tripId, status: "success" });
    } catch (err) {
      setConfigureState({
        tripId,
        status: "error",
        message: err instanceof Error ? err.message : "Falha ao gravar a tag.",
      });
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

  async function testReadTag() {
    setReadTestState({ status: "reading" });
    try {
      const result = await readNfcTag();
      const matched = trips?.find((trip) => trip.nfcUrl === result.url);
      setReadTestState({
        status: "success",
        url: result.url,
        matchedTitle: matched?.title ?? null,
      });
    } catch (err) {
      setReadTestState({
        status: "error",
        message: err instanceof Error ? err.message : "Falha ao ler a tag.",
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
        {canWriteDirectly ? (
          <p className={styles.lead}>
            Escolha uma viagem abaixo e toque em &ldquo;Configurar nova tag
            NFC&rdquo;. O Moments Forever aproveita para aproximar uma tag em
            branco do celular e grava tudo sozinho — sem sair do app.
          </p>
        ) : (
          <p className={styles.lead}>
            Este navegador não grava tags NFC diretamente (limitação do
            iPhone/Safari fora do app, não do Moments Forever). Escolha uma
            viagem, copie o link e grave-o com um app gratuito como NFC Tools
            — só precisa fazer isso uma vez por tag.
          </p>
        )}
        {limit ? (
          <p className={styles.lead}>
            {limit.max === null
              ? `${limit.used} tags NFC criadas.`
              : `${limit.used} de ${limit.max} tags NFC do seu plano em uso.`}
          </p>
        ) : null}
        {canReadNatively ? (
          <div className={styles.readTest}>
            <button
              className="button secondary"
              disabled={readTestState?.status === "reading"}
              onClick={() => void testReadTag()}
              type="button"
            >
              {readTestState?.status === "reading"
                ? "Aproxime a tag…"
                : "Testar tag NFC"}
            </button>
            {readTestState?.status === "success" ? (
              <p className={styles.tripHint}>
                {readTestState.url
                  ? readTestState.matchedTitle
                    ? `Essa tag abre: ${readTestState.matchedTitle}`
                    : `Tag lida, mas o link não corresponde a nenhuma das suas viagens: ${readTestState.url}`
                  : "Tag lida, mas não tem nenhum link gravado."}
              </p>
            ) : null}
            {readTestState?.status === "error" ? (
              <p className={styles.error} role="alert">
                {readTestState.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {trips === null ? (
        <p className={styles.lead}>Carregando suas viagens…</p>
      ) : trips.length === 0 ? (
        <p className={styles.lead}>Você ainda não tem viagens.</p>
      ) : (
        <ul className={styles.list}>
          {trips.map((trip) => {
            const stateForTrip =
              configureState?.tripId === trip.experienceId
                ? configureState
                : null;
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
                  {stateForTrip?.status === "linking" ? (
                    <p className={styles.tripHint}>Criando o link da tag…</p>
                  ) : null}
                  {stateForTrip?.status === "writing" ? (
                    <p className={styles.tripHint}>
                      Aproxime uma tag NFC em branco do celular…
                    </p>
                  ) : null}
                  {stateForTrip?.status === "success" ? (
                    <p className={styles.tripHint}>
                      Tag configurada com sucesso!
                    </p>
                  ) : null}
                  {stateForTrip?.status === "error" ? (
                    <p className={styles.error} role="alert">
                      {stateForTrip.message}
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
                          disabled={stateForTrip?.status === "writing"}
                          onClick={() =>
                            void writeToTag(
                              trip.experienceId,
                              trip.nfcUrl ?? "",
                            )
                          }
                          type="button"
                        >
                          {stateForTrip?.status === "writing"
                            ? "Gravando…"
                            : "Gravar em nova tag"}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <button
                      className="button primary"
                      disabled={
                        stateForTrip?.status === "linking" ||
                        stateForTrip?.status === "writing" ||
                        atLimit
                      }
                      onClick={() => void configureNewTag(trip.experienceId)}
                      type="button"
                    >
                      {stateForTrip?.status === "linking"
                        ? "Criando link…"
                        : stateForTrip?.status === "writing"
                          ? "Aproxime a tag…"
                          : "Configurar nova tag NFC"}
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

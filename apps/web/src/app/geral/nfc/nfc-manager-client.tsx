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
  /** The specific root album (destination card) this tag belongs to — the
   * identity that actually matters here, since one experience can have
   * several root albums (e.g. "Dubai" and "Bali" under one import trip). */
  readonly albumId: string;
  readonly title: string;
  readonly countryCode: string | null;
  readonly coverPhotoId: string | null;
  readonly photoCount: number;
  readonly nfcToken: string | null;
  readonly nfcUrl: string | null;
}

/**
 * Per-row state for the combined "create the link + write it to a physical
 * tag in one tap" flow ({@link configureNewTag}), and for re-writing an
 * existing link onto an additional tag ({@link writeToTag}). Keyed by
 * albumId, not experienceId — two rows can share an experienceId.
 */
type ConfigureState =
  | { readonly albumId: string; readonly status: "linking" }
  | { readonly albumId: string; readonly status: "writing" }
  | { readonly albumId: string; readonly status: "success" }
  | {
      readonly albumId: string;
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

/**
 * Tag-first flow: pick a trip, then write straight away. This does NOT read
 * the tag first — a genuinely blank/new tag isn't NDEF-formatted yet (or has
 * no records), so a read attempt on it fails with "Failed to read NDEF
 * message" even though it's perfectly writable. Only `writeNDEF` needs to
 * touch the tag here.
 */
type NewTagFlowState =
  | { readonly step: "picking" }
  | { readonly step: "writing"; readonly title: string }
  | { readonly step: "success"; readonly title: string }
  | { readonly step: "error"; readonly message: string };

/** TEMPORARY diagnostic logging for the "wrong trip written" investigation. */
function logTripSelection(label: string, trip: TripNfcInfo) {
  console.log(`[nfc-debug] ${label}: ${trip.title}`);
  console.log("[nfc-debug] EXPERIENCE ID:", trip.experienceId);
  console.log("[nfc-debug] ALBUM ID:", trip.albumId);
  console.log("[nfc-debug] NFC TOKEN (before write):", trip.nfcToken);
  console.log("[nfc-debug] NFC URL (before write):", trip.nfcUrl);
}

function logWritingUrl(url: string) {
  console.log("[nfc-debug] WRITING URL:", url);
}

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
  const [newTagFlow, setNewTagFlow] = useState<NewTagFlowState | null>(null);
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
        const loadedTrips = payload.trips ?? [];
        console.log(
          "[nfc-debug] /api/me/nfc-tags loaded",
          loadedTrips.length,
          "trips:",
        );
        for (const trip of loadedTrips) {
          console.log(
            `[nfc-debug]   - ${trip.title} | experienceId=${trip.experienceId} | albumId=${trip.albumId} | nfcUrl=${trip.nfcUrl}`,
          );
        }
        setTrips(loadedTrips);
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

  /** Creates this destination's `/n/{token}` link (if it doesn't exist yet). */
  async function createTagLink(
    trip: TripNfcInfo,
  ): Promise<{ readonly token: string; readonly url: string }> {
    const response = await fetch("/api/nfc-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experienceId: trip.experienceId,
        albumId: trip.albumId,
      }),
    });
    const payload = (await response.json()) as {
      readonly token?: string;
      readonly url?: string;
      readonly error?: string;
    };
    if (!response.ok || !payload.token || !payload.url) {
      throw new Error(payload.error ?? "Não foi possível criar a tag NFC.");
    }
    const { token, url } = payload;
    console.log(
      `[nfc-debug] createTagLink(albumId=${trip.albumId}) → token=${token} url=${url}`,
    );
    setTrips((current) =>
      current
        ? current.map((t) =>
            t.albumId === trip.albumId
              ? { ...t, nfcToken: token, nfcUrl: url }
              : t,
          )
        : current,
    );
    setLimit((current) =>
      current ? { ...current, used: current.used + 1 } : current,
    );
    return { token, url };
  }

  /**
   * The main "Configurar nova tag NFC" flow: creates this destination's short
   * link, then — when this build can write NFC directly (native app or Web
   * NFC) — immediately starts the write session so the user only has to tap
   * the tag once, never leaving the app. Falls back to just creating the
   * link (for copy + a third-party writer app) when neither is available.
   */
  async function configureNewTag(trip: TripNfcInfo) {
    logTripSelection("SELECTED TRIP (configureNewTag)", trip);
    setLoadError(null);
    setConfigureState({ albumId: trip.albumId, status: "linking" });
    let url: string;
    try {
      const created = await createTagLink(trip);
      url = created.url;
    } catch (err) {
      setConfigureState({
        albumId: trip.albumId,
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

    setConfigureState({ albumId: trip.albumId, status: "writing" });
    try {
      logWritingUrl(url);
      await writeUrlToNfcTagAuto(url);
      setConfigureState({ albumId: trip.albumId, status: "success" });
    } catch (err) {
      setConfigureState({
        albumId: trip.albumId,
        status: "error",
        message: err instanceof Error ? err.message : "Falha ao gravar a tag.",
      });
    }
  }

  /** Writes an *already-linked* destination's URL onto an additional physical tag. */
  async function writeToTag(trip: TripNfcInfo) {
    logTripSelection("SELECTED TRIP (writeToTag)", trip);
    const url = trip.nfcUrl;
    if (!url) {
      setConfigureState({
        albumId: trip.albumId,
        status: "error",
        message: "Esta viagem ainda não tem um link NFC criado.",
      });
      return;
    }
    setConfigureState({ albumId: trip.albumId, status: "writing" });
    try {
      logWritingUrl(url);
      await writeUrlToNfcTagAuto(url);
      setConfigureState({ albumId: trip.albumId, status: "success" });
    } catch (err) {
      setConfigureState({
        albumId: trip.albumId,
        status: "error",
        message: err instanceof Error ? err.message : "Falha ao gravar a tag.",
      });
    }
  }

  async function copyUrl(albumId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copie o link:", url);
    }
    setCopiedId(albumId);
    setTimeout(() => {
      setCopiedId((current) => (current === albumId ? null : current));
    }, 2000);
  }

  async function testReadTag() {
    setReadTestState({ status: "reading" });
    try {
      const result = await readNfcTag();
      console.log("[nfc-debug] READ BACK URL:", result.url);
      const matched = trips?.find((trip) => trip.nfcUrl === result.url);
      console.log(
        "[nfc-debug] READ BACK matches trip:",
        matched?.title ?? "(none of the loaded trips)",
      );
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

  /**
   * Step 1 of the tag-first flow: just show the trip picker. Does NOT touch
   * the tag at all — see the NewTagFlowState doc comment for why a read here
   * would break on a genuinely blank tag.
   */
  function startNewTagFlow() {
    setNewTagFlow({ step: "picking" });
  }

  /** Step 2: user picked a destination — create its link if needed, then write. */
  async function finishNewTagFlow(trip: TripNfcInfo) {
    logTripSelection("SELECTED TRIP (Nova tag NFC)", trip);
    setNewTagFlow({ step: "writing", title: trip.title });
    try {
      const url = trip.nfcUrl ?? (await createTagLink(trip)).url;
      logWritingUrl(url);
      await writeUrlToNfcTagAuto(url);
      setNewTagFlow({ step: "success", title: trip.title });
    } catch (err) {
      setNewTagFlow({
        step: "error",
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
          {canWriteDirectly
            ? "Toque em “Nova tag NFC”, escolha a viagem e aproxime uma tag em branco do celular — o app grava sozinho."
            : "Grave tags NFC diretamente pelo app Moments Forever no iPhone. Neste navegador, copie o link da viagem e grave com um leitor NFC de sua preferência."}
        </p>
        {canReadNatively ? (
          <div className={styles.readTest}>
            <div className={styles.quickActions}>
              <button
                className="button primary"
                disabled={
                  newTagFlow !== null &&
                  newTagFlow.step !== "success" &&
                  newTagFlow.step !== "error"
                }
                onClick={startNewTagFlow}
                type="button"
              >
                Nova tag NFC
              </button>
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
            </div>

            {newTagFlow?.step === "picking" ? (
              <div className={styles.tagPicker}>
                <p className={styles.tripHint}>
                  Escolha a viagem que deseja vincular a uma nova tag:
                </p>
                <ul className={styles.tagPickerList}>
                  {(trips ?? []).map((trip) => (
                    <li key={trip.albumId}>
                      <button
                        className="button secondary"
                        onClick={() => void finishNewTagFlow(trip)}
                        type="button"
                      >
                        {trip.title}
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  className="button secondary"
                  onClick={() => setNewTagFlow(null)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            ) : null}
            {newTagFlow?.step === "writing" ? (
              <p className={styles.tripHint}>
                Aproxime uma tag NFC em branco do celular para gravar &ldquo;
                {newTagFlow.title}&rdquo;…
              </p>
            ) : null}
            {newTagFlow?.step === "success" ? (
              <p className={styles.tripHint}>
                Tag configurada com sucesso! Vinculada a &ldquo;
                {newTagFlow.title}&rdquo;.
              </p>
            ) : null}
            {newTagFlow?.step === "error" ? (
              <p className={styles.error} role="alert">
                {newTagFlow.message}
              </p>
            ) : null}

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
              configureState?.albumId === trip.albumId ? configureState : null;
            return (
              <li className={styles.row} key={trip.albumId}>
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
                          void copyUrl(trip.albumId, trip.nfcUrl ?? "")
                        }
                        type="button"
                      >
                        {copiedId === trip.albumId ? "Copiado" : "Copiar link"}
                      </button>
                      {canWriteDirectly ? (
                        <button
                          className="button secondary"
                          disabled={stateForTrip?.status === "writing"}
                          onClick={() => void writeToTag(trip)}
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
                      onClick={() => void configureNewTag(trip)}
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

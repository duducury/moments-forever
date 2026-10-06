"use client";

import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { MomentsPhotoLibrary } from "@moments-forever/capacitor-photo-library";

import { useAuth } from "@/components/auth-provider";
import {
  buildDiscoverCandidates,
  buildRelatedCandidate,
  experiencesToCheck,
} from "@/lib/photo-library/candidates";
import { discoverTrips } from "@/lib/photo-library/discover-trips";
import {
  createLibraryClient,
  LibraryCancelledError,
  type AccessState,
  type ScanOutcome,
} from "@/lib/photo-library/library-client";
import {
  clearAll,
  emptySelection,
  reviewSelection,
  selectAll,
  selectedAssets,
  toggleAsset,
  type Candidate,
  type Selection,
} from "@/lib/photo-library/selection";
import type {
  DiscoveredTrip,
  PhotoLibraryContext,
} from "@/lib/photo-library/types";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";
import { createNamedTripFromFiles, TripLicenseError } from "@/lib/photos/create-named-trip-from-files";
import { uploadFilesToAlbum } from "@/lib/photos/upload-files-to-album";

import styles from "./find-trips.module.css";

export type FindFlowTarget =
  | { readonly mode: "discover" }
  | {
      readonly mode: "related";
      readonly experienceId: string;
      /** Destination album, or null when the person is creating one. */
      readonly albumId: string | null;
      /** Creates the destination album on confirm (when `albumId` is null). */
      readonly resolveAlbumId?: () => Promise<string>;
    };

type Step =
  | "intro"
  | "scanning"
  | "trips"
  | "photos"
  | "review"
  | "importing"
  | "done"
  | "empty";

interface ImportResult {
  readonly title: string;
  readonly added: number;
  readonly skipped: number;
  readonly href: string | null;
  readonly error: string | null;
  readonly warning: string | null;
}

const PAGE = 60;
const GEOCODE_BATCH = 6;
const GEOCODE_MAX_TRIPS = 24;

function formatPeriod(period: Candidate["period"]): string {
  if (!period) return "";
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const year = period.end.slice(0, 4);
  return period.start === period.end
    ? `${day(period.start)} de ${year}`
    : `${day(period.start)} – ${day(period.end)} de ${year}`;
}

function photosLabel(count: number): string {
  return `${count} foto${count === 1 ? "" : "s"}`;
}

function Flag({ code }: { readonly code: string | null }) {
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
    <img
      alt=""
      className={styles.flag}
      decoding="async"
      height={16}
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      width={22}
    />
  );
}

async function fetchContext(experienceIds?: readonly string[]): Promise<PhotoLibraryContext> {
  const query =
    experienceIds && experienceIds.length > 0
      ? `?experienceIds=${encodeURIComponent(experienceIds.join(","))}`
      : "";
  const response = await fetch(`/api/me/photo-library-context${query}`, {
    cache: "no-store",
  });
  const body = (await response.json()) as PhotoLibraryContext & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Não foi possível carregar suas viagens.");
  }
  return body;
}

export function FindTripsFlow({
  target,
  onClose,
  onImported,
}: {
  readonly target: FindFlowTarget;
  readonly onClose: () => void;
  readonly onImported?: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const related = target.mode === "related";
  const client = useMemo(
    () =>
      createLibraryClient({
        plugin: MomentsPhotoLibrary,
        platform: Capacitor.getPlatform() === "android" ? "android" : "ios",
      }),
    [],
  );

  const [step, setStep] = useState<Step>("intro");
  const [access, setAccess] = useState<AccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [scan, setScan] = useState<ScanOutcome | null>(null);
  const [discovered, setDiscovered] = useState<readonly DiscoveredTrip[]>([]);
  const [context, setContext] = useState<PhotoLibraryContext | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [legacy, setLegacy] = useState<PhotoLibraryContext["legacyPhotos"]>([]);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [relatedCandidate, setRelatedCandidate] = useState<Candidate | null>(null);
  const [emptyReason, setEmptyReason] = useState<string>("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [selection, setSelection] = useState<Selection>(emptySelection());
  const [photoIndex, setPhotoIndex] = useState(0);
  const [visible, setVisible] = useState(PAGE);
  const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(new Map());
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<readonly ImportResult[]>([]);
  const [licenseBlock, setLicenseBlock] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestedThumbs = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // ---- candidates -----------------------------------------------------------

  const candidates = useMemo<readonly Candidate[]>(() => {
    if (related) return relatedCandidate ? [relatedCandidate] : [];
    if (!context) return [];
    const built = buildDiscoverCandidates({
      trips: discovered,
      labels,
      context,
      legacyPhotos: legacy,
    });
    return [...built.fresh, ...built.existing].map((candidate) =>
      candidate.kind === "new" && renames[candidate.key] !== undefined
        ? { ...candidate, title: renames[candidate.key] as string }
        : candidate,
    );
  }, [related, relatedCandidate, context, discovered, labels, legacy, renames]);

  const fresh = candidates.filter((candidate) => candidate.kind === "new");
  const existing = candidates.filter((candidate) => candidate.kind === "existing");
  const chosenCandidates = candidates.filter((candidate) => chosen.has(candidate.key));
  const current = chosenCandidates[photoIndex] ?? null;
  const review = reviewSelection(candidates, selection, chosen);

  // ---- scanning -------------------------------------------------------------

  const run = useCallback(async () => {
    setError(null);
    setStep("scanning");
    setScanned(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const experienceIds = target.mode === "related" ? [target.experienceId] : undefined;
      const [outcome, ctx] = await Promise.all([
        client.scan({ onProgress: setScanned, signal: controller.signal }),
        fetchContext(experienceIds),
      ]);
      if (!mounted.current) return;
      setScan(outcome);
      setContext(ctx);

      if (target.mode === "related") {
        const { candidate, unavailable } = buildRelatedCandidate({
          assets: outcome.assets,
          context: ctx,
          experienceId: target.experienceId,
          albumId: target.albumId,
          legacyPhotos: ctx.legacyPhotos,
        });
        if (!candidate || candidate.assets.length === 0) {
          setEmptyReason(
            unavailable === "no-dates"
              ? "Esta viagem ainda não tem fotos com data, então não dá para procurar outras parecidas."
              : unavailable === "no-trip"
                ? "Não encontramos esta viagem para comparar."
                : "Não encontramos fotos novas para esta viagem. O que combina com ela já está aqui.",
          );
          setStep("empty");
          return;
        }
        setRelatedCandidate(candidate);
        setChosen(new Set([candidate.key]));
        setPhotoIndex(0);
        setVisible(PAGE);
        setStep("photos");
        return;
      }

      if (outcome.assets.length === 0) {
        setEmptyReason(
          "Não encontramos fotos neste aparelho para analisar. Se você deu acesso só a algumas fotos, escolha mais.",
        );
        setStep("empty");
        return;
      }
      const trips = discoverTrips(outcome.assets);
      setDiscovered(trips);
      setStep("trips");
    } catch (caught) {
      if (caught instanceof LibraryCancelledError || !mounted.current) return;
      setError(caught instanceof Error ? caught.message : "Não foi possível ler suas fotos.");
      setStep("intro");
    }
  }, [client, target]);

  async function begin() {
    setError(null);
    try {
      const state = await client.ensureAccess();
      setAccess(state);
      if (state.canRead) await run();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível pedir acesso às fotos.");
    }
  }

  async function chooseMorePhotos() {
    try {
      await client.presentLimitedPicker();
      await run();
    } catch {
      setError("Não foi possível abrir a seleção de fotos.");
    }
  }

  // Name the trips by their place — only the centers (a few coordinates) are sent.
  useEffect(() => {
    if (related || discovered.length === 0) return;
    let cancelled = false;
    (async () => {
      const withCenter = discovered
        .filter((trip) => trip.center)
        .slice(0, GEOCODE_MAX_TRIPS);
      for (let start = 0; start < withCenter.length; start += GEOCODE_BATCH) {
        const batch = withCenter.slice(start, start + GEOCODE_BATCH);
        try {
          const response = await fetch("/api/geocode/reverse", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lookups: batch.map((trip) => ({
                id: trip.id,
                latitude: trip.center?.latitude,
                longitude: trip.center?.longitude,
                name: "Lugar 1",
                confirmedByUser: false,
              })),
            }),
          });
          if (!response.ok) continue;
          const body = (await response.json()) as { labels?: Record<string, string> };
          if (!cancelled && body.labels) {
            setLabels((previous) => ({ ...previous, ...body.labels }));
          }
        } catch {
          // Names are a nicety: keep the date-based title.
        }
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [related, discovered]);

  // Older photos (from before the origin was recorded) of the trips that matched.
  const legacyKey = useMemo(
    () =>
      related || !context
        ? ""
        : experiencesToCheck(discovered, context, labels).sort().join(","),
    [related, context, discovered, labels],
  );
  useEffect(() => {
    if (!legacyKey) return;
    let cancelled = false;
    fetchContext(legacyKey.split(","))
      .then((ctx) => {
        if (!cancelled) setLegacy(ctx.legacyPhotos);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [legacyKey]);

  // ---- thumbnails (only for the page of photos being looked at) ---------------

  useEffect(() => {
    if (step !== "photos" || !current) return;
    const wanted = current.assets
      .slice(0, visible)
      .map((asset) => asset.nativeId)
      .filter((id) => !requestedThumbs.current.has(id));
    if (wanted.length === 0) return;
    for (const id of wanted) requestedThumbs.current.add(id);
    let cancelled = false;
    (async () => {
      for (let start = 0; start < wanted.length; start += 20) {
        try {
          const batch = await client.thumbnails(wanted.slice(start, start + 20));
          if (cancelled || !mounted.current) return;
          setThumbs((previous) => new Map([...previous, ...batch]));
        } catch {
          // A missing thumbnail is just a gray square.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, current, visible, client]);

  // ---- importing --------------------------------------------------------------

  async function importAll() {
    if (review.blocker) return;
    setError(null);
    setStep("importing");
    const controller = new AbortController();
    abortRef.current = controller;
    const done: ImportResult[] = [];

    for (const row of review.importable) {
      const candidate = candidates.find((item) => item.key === row.key);
      if (!candidate) continue;
      const assets = selectedAssets(candidate, selection);
      try {
        setStatus(`Preparando as fotos de ${row.title || "esta viagem"}…`);
        const exported = await client.exportAssets(assets, {
          signal: controller.signal,
          onProgress: (finished, total) =>
            setStatus(`Preparando foto ${Math.min(finished + 1, total)} de ${total}…`),
        });
        if (exported.files.length === 0) {
          throw new Error("Nenhuma foto pôde ser preparada (iCloud sem conexão?).");
        }

        if (candidate.kind === "new") {
          if (!user) throw new Error("Entre na sua conta para criar a viagem.");
          const created = await createNamedTripFromFiles({
            files: exported.files,
            name: row.title,
            ownerId: user.id,
            origins: exported.origins,
            onProgress: setStatus,
          });
          done.push({
            title: row.title,
            added: exported.files.length,
            skipped: exported.failed.length,
            href: profileTripAlbumPath(created.slug, created.albumId),
            error: null,
            warning: created.cloudWarning,
          });
        } else {
          const destination = candidate.target;
          if (!destination) throw new Error("Viagem de destino não encontrada.");
          let albumId = destination.albumId;
          if (target.mode === "related") {
            albumId =
              target.albumId ??
              (target.resolveAlbumId ? await target.resolveAlbumId() : destination.albumId);
          }
          const uploaded = await uploadFilesToAlbum({
            experienceId: destination.experienceId,
            albumId,
            files: exported.files,
            origins: exported.origins,
            onProgress: setStatus,
          });
          done.push({
            title: row.title || destination.title,
            added: exported.files.length,
            skipped: exported.failed.length,
            href: profileTripAlbumPath(destination.experienceSlug, albumId),
            error: null,
            warning: uploaded.cloudWarning,
          });
        }
      } catch (caught) {
        if (caught instanceof LibraryCancelledError) {
          done.push({ title: row.title, added: 0, skipped: 0, href: null, error: "Cancelado.", warning: null });
          break;
        }
        if (caught instanceof TripLicenseError) {
          setLicenseBlock(caught.message);
          done.push({ title: row.title, added: 0, skipped: 0, href: null, error: caught.message, warning: null });
          break;
        }
        done.push({
          title: row.title,
          added: 0,
          skipped: 0,
          href: null,
          error: caught instanceof Error ? caught.message : "Falha ao adicionar.",
          warning: null,
        });
      }
    }

    if (!mounted.current) return;
    setResults(done);
    setStatus("");
    setStep("done");
    if (done.some((item) => item.added > 0)) onImported?.();
  }

  function finish() {
    router.refresh();
    onClose();
  }

  // ---- rendering --------------------------------------------------------------

  function toggleChosen(key: string) {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openPhotos() {
    setPhotoIndex(0);
    setVisible(PAGE);
    setStep("photos");
  }

  const stats = scan
    ? `Analisamos ${scan.totalAssets.toLocaleString("pt-BR")} fotos em ${(scan.totalMs / 1000).toFixed(1)} s, aqui no aparelho.`
    : null;

  const limitedBanner = access?.limited ? (
    <div className={styles.banner}>
      <span>Você deixou o app ver só algumas fotos. Escolha mais para achar mais viagens.</span>
      <button className={styles.linkButton} onClick={() => void chooseMorePhotos()} type="button">
        Escolher mais fotos
      </button>
    </div>
  ) : null;

  const busyStep = step === "scanning" || step === "importing";
  const title = related ? "✨ Encontrar fotos" : "✨ Encontrar viagem";

  const content = (() => {
    if (step === "intro") {
      return (
        <>
          <h2>{title}</h2>
          <p className={styles.hint}>
            {related
              ? "Vamos procurar, nas fotos deste aparelho, as que combinam com as datas e os lugares desta viagem e que ainda não estão nela."
              : "Vamos olhar as datas e os lugares das fotos deste aparelho para achar viagens que você ainda não guardou."}{" "}
            Tudo acontece aqui no aparelho. Nada é enviado, importado ou criado sem você escolher e confirmar.
          </p>
          {access?.blocked ? (
            <div className={styles.banner}>
              <span>O acesso às fotos está desligado. Ligue em Ajustes para continuar.</span>
              <button className={styles.linkButton} onClick={() => void client.openSettings()} type="button">
                Abrir Ajustes
              </button>
            </div>
          ) : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            <button className="button secondary" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="button primary" onClick={() => void begin()} type="button">
              Continuar
            </button>
          </div>
        </>
      );
    }

    if (step === "scanning") {
      return (
        <>
          <h2>{title}</h2>
          <div className={styles.progress}>
            <p>Procurando nas suas fotos…</p>
            {scanned > 0 ? <p className={styles.hint}>{scanned.toLocaleString("pt-BR")} fotos lidas</p> : null}
          </div>
          <div className={styles.actions}>
            <button
              className="button secondary"
              onClick={() => {
                abortRef.current?.abort();
                onClose();
              }}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </>
      );
    }

    if (step === "empty") {
      return (
        <>
          <h2>{title}</h2>
          <p className={styles.hint}>{emptyReason}</p>
          {limitedBanner}
          {stats ? <p className={styles.stats}>{stats}</p> : null}
          <div className={styles.actions}>
            <button className="button primary" onClick={onClose} type="button">
              Fechar
            </button>
          </div>
        </>
      );
    }

    if (step === "trips") {
      const freshSection = fresh.length > 0;
      const existingWithNew = existing.filter((candidate) => candidate.assets.length > 0);
      const nothing = !freshSection && existingWithNew.length === 0;
      const renderRow = (candidate: Candidate, disabled = false) => {
        const selected = chosen.has(candidate.key);
        return (
          <li key={candidate.key}>
            <button
              className={styles.row}
              data-selected={selected ? "true" : "false"}
              disabled={disabled}
              onClick={() => toggleChosen(candidate.key)}
              type="button"
            >
              <span aria-hidden className={styles.check}>{selected ? "✓" : ""}</span>
              <Flag code={candidate.countryCode} />
              <span className={styles.rowCopy}>
                <span className={styles.rowTitle}>{candidate.title}</span>
                <span className={styles.rowMeta}>
                  {formatPeriod(candidate.period)} · {photosLabel(candidate.assets.length)}
                  {candidate.kind === "existing" ? " novas" : ""}
                </span>
                {candidate.hint ? <span className={styles.rowHint}>{candidate.hint}</span> : null}
              </span>
            </button>
          </li>
        );
      };
      return (
        <>
          <h2>{freshSection ? "✨ Encontramos novas viagens" : title}</h2>
          {limitedBanner}
          <div className={styles.body}>
            {nothing ? (
              <p className={styles.hint}>
                Não encontramos viagens novas nas fotos deste aparelho. O que achamos já está no Moments Forever.
              </p>
            ) : null}
            {freshSection ? (
              <>
                <p className={styles.section}>Novas viagens</p>
                <ul className={styles.list}>{fresh.map((candidate) => renderRow(candidate))}</ul>
              </>
            ) : null}
            {existingWithNew.length > 0 ? (
              <>
                <p className={styles.section}>Já no Moments Forever — com fotos novas</p>
                <ul className={styles.list}>
                  {existingWithNew.map((candidate) => renderRow(candidate))}
                </ul>
              </>
            ) : null}
            {stats ? <p className={styles.stats}>{stats}</p> : null}
          </div>
          <div className={styles.actions}>
            <button className="button secondary" onClick={onClose} type="button">
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={chosen.size === 0}
              onClick={openPhotos}
              type="button"
            >
              Continuar
            </button>
          </div>
        </>
      );
    }

    if (step === "photos" && current) {
      const ticked = selection.get(current.key) ?? new Set<string>();
      const shown = current.assets.slice(0, visible);
      const last = photoIndex >= chosenCandidates.length - 1;
      return (
        <>
          <div>
            <h2>
              {related ? "Fotos que podem ser desta viagem" : current.title || "Nova viagem"}
            </h2>
            <p className={styles.hint}>
              {related ? `${current.title} · ` : ""}
              {formatPeriod(current.period)} · {photosLabel(current.assets.length)} encontradas ·{" "}
              {ticked.size} selecionada{ticked.size === 1 ? "" : "s"}
              {chosenCandidates.length > 1
                ? ` · viagem ${photoIndex + 1} de ${chosenCandidates.length}`
                : ""}
            </p>
          </div>
          {current.kind === "new" ? (
            <input
              aria-label="Nome da viagem"
              className={styles.nameInput}
              maxLength={80}
              onChange={(event) =>
                setRenames((previous) => ({ ...previous, [current.key]: event.target.value }))
              }
              placeholder="Nome da viagem"
              type="text"
              value={current.title}
            />
          ) : null}
          <div className={styles.toolbar}>
            <button
              className={styles.linkButton}
              onClick={() => setSelection((previous) => selectAll(previous, current))}
              type="button"
            >
              Selecionar todas
            </button>
            <button
              className={styles.linkButton}
              onClick={() => setSelection((previous) => clearAll(previous, current.key))}
              type="button"
            >
              Desmarcar todas
            </button>
          </div>
          <div className={styles.body}>
            <div className={styles.grid}>
              {shown.map((asset) => {
                const on = ticked.has(asset.nativeId);
                const src = thumbs.get(asset.nativeId);
                return (
                  <button
                    aria-label={on ? "Desmarcar foto" : "Selecionar foto"}
                    aria-pressed={on}
                    className={styles.cell}
                    data-selected={on ? "true" : "false"}
                    key={asset.nativeId}
                    onClick={() =>
                      setSelection((previous) => toggleAsset(previous, current.key, asset.nativeId))
                    }
                    type="button"
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local data URL thumbnail
                      <img alt="" decoding="async" src={src} />
                    ) : null}
                    <span aria-hidden className={styles.cellMark}>✓</span>
                  </button>
                );
              })}
            </div>
            {visible < current.assets.length ? (
              <p>
                <button
                  className={styles.linkButton}
                  onClick={() => setVisible((count) => count + PAGE)}
                  type="button"
                >
                  Ver mais fotos
                </button>
              </p>
            ) : null}
            {current.withoutLocationCount > 0 ? (
              <p className={styles.stats}>
                {photosLabel(current.withoutLocationCount)} sem localização foram incluídas pela data.
              </p>
            ) : null}
          </div>
          <div className={styles.actions}>
            <button
              className="button secondary"
              onClick={() => {
                if (photoIndex > 0) {
                  setPhotoIndex(photoIndex - 1);
                  setVisible(PAGE);
                } else if (related) onClose();
                else setStep("trips");
              }}
              type="button"
            >
              {photoIndex === 0 && related ? "Cancelar" : "Voltar"}
            </button>
            <button
              className="button primary"
              onClick={() => {
                if (last) setStep("review");
                else {
                  setPhotoIndex(photoIndex + 1);
                  setVisible(PAGE);
                }
              }}
              type="button"
            >
              {last ? "Revisar" : "Próxima viagem"}
            </button>
          </div>
        </>
      );
    }

    if (step === "review") {
      return (
        <>
          <h2>Pronto para adicionar</h2>
          <div className={styles.body}>
            {review.rows.map((row) => (
              <div className={styles.summaryRow} key={row.key}>
                <span>
                  <strong>{row.title || "Sem nome"}</strong>
                  <br />
                  <span className={styles.rowMeta}>
                    {row.kind === "existing" ? "Entra na viagem que você já tem" : "Viagem nova"} ·{" "}
                    {row.found} encontradas
                  </span>
                </span>
                <strong>{photosLabel(row.selected)}</strong>
              </div>
            ))}
            <p className={styles.summaryTotal}>
              Total: {review.tripCount} viage{review.tripCount === 1 ? "m" : "ns"} ·{" "}
              {photosLabel(review.photoCount)}
            </p>
            <p className={styles.hint}>
              Só agora as fotos escolhidas serão preparadas e enviadas. Nada mais é adicionado.
            </p>
          </div>
          {review.blocker ? <p className={styles.error}>{review.blocker}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            <button className="button secondary" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="button secondary" onClick={() => { setPhotoIndex(0); setStep("photos"); }} type="button">
              Voltar
            </button>
            <button
              className="button primary"
              disabled={Boolean(review.blocker)}
              onClick={() => void importAll()}
              type="button"
            >
              {related ? `Adicionar ${photosLabel(review.photoCount)}` : "Adicionar viagens"}
            </button>
          </div>
        </>
      );
    }

    if (step === "importing") {
      return (
        <>
          <h2>Adicionando…</h2>
          <div className={styles.progress}>
            <p>{status || "Preparando…"}</p>
            <p className={styles.hint}>Mantenha o app aberto até terminar.</p>
          </div>
          <div className={styles.actions}>
            <button className="button secondary" onClick={() => abortRef.current?.abort()} type="button">
              Parar
            </button>
          </div>
        </>
      );
    }

    // done
    const ok = results.filter((item) => item.added > 0);
    const last = ok[ok.length - 1];
    return (
      <>
        <h2>{ok.length > 0 ? "Pronto!" : "Não foi possível adicionar"}</h2>
        <div className={styles.body}>
          {results.map((item, index) => (
            <div className={styles.summaryRow} key={`${item.title}-${index}`}>
              <span>
                <strong>{item.title}</strong>
                <br />
                <span className={styles.rowMeta}>
                  {item.error
                    ? item.error
                    : `${photosLabel(item.added)} adicionada${item.added === 1 ? "" : "s"}${
                        item.skipped > 0 ? ` · ${photosLabel(item.skipped)} não puderam ser preparadas` : ""
                      }`}
                  {item.warning ? ` · envio à nuvem: ${item.warning}` : ""}
                </span>
              </span>
              <strong>{item.error ? "✕" : "✓"}</strong>
            </div>
          ))}
          {licenseBlock ? (
            <p className={styles.hint}>
              <Link href="/ativar">Ativar nova key</Link>
            </p>
          ) : null}
        </div>
        <div className={styles.actions}>
          {last?.href ? (
            <button
              className="button secondary"
              onClick={() => {
                onClose();
                router.push(last.href as string);
              }}
              type="button"
            >
              Ver viagem
            </button>
          ) : null}
          <button className="button primary" onClick={finish} type="button">
            Concluir
          </button>
        </div>
      </>
    );
  })();

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busyStep && step !== "photos" && step !== "review") {
          onClose();
        }
      }}
      role="presentation"
    >
      <div aria-label={title} aria-modal="true" className={styles.card} role="dialog">
        {content}
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { MomentsPhotoLibrary } from "@moments-forever/capacitor-photo-library";

import { useAuth } from "@/components/auth-provider";
import { PageScrollLock } from "@/components/use-lock-page-scroll";
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
  loadKnownCities,
  nearestKnownCity,
} from "@/lib/photo-library/place-fallback";
import {
  loadAdminGeo,
  quickPlace,
  type QuickPlace,
} from "@/lib/photo-library/quick-place";
import {
  clearAll,
  describeCounts,
  emptySelection,
  pickPreview,
  reviewSelection,
  selectAll,
  selectedAssets,
  selectedCount,
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
import { PhotoGrid } from "./photo-grid";
import {
  Flag,
  formatPeriod,
  photosLabel,
  PREVIEW_COUNT,
  PreviewStrip,
  TripCard,
} from "./trip-card";

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
  | "detail"
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
/** Place lookups per request (the geocoder allows ~1 request/second, so keep batches small). */
const GEOCODE_BATCH = 4;
const GEOCODE_MAX_STOPS = 60;

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

  // "Encontrar uma viagem" starts reading the library right away (no explanatory screen);
  // "intro" is then only the fallback for a blocked permission or a failed start.
  const [step, setStep] = useState<Step>(related ? "intro" : "scanning");
  const [access, setAccess] = useState<AccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [scan, setScan] = useState<ScanOutcome | null>(null);
  const [discovered, setDiscovered] = useState<readonly DiscoveredTrip[]>([]);
  const [context, setContext] = useState<PhotoLibraryContext | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const [quick, setQuick] = useState<Record<string, QuickPlace>>({});
  const [legacy, setLegacy] = useState<PhotoLibraryContext["legacyPhotos"]>([]);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [relatedCandidate, setRelatedCandidate] = useState<Candidate | null>(null);
  const [emptyReason, setEmptyReason] = useState<string>("");
  const [selection, setSelection] = useState<Selection>(emptySelection());
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(new Map());
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<readonly ImportResult[]>([]);
  const [licenseBlock, setLicenseBlock] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const requestedThumbs = useRef(new Set<string>());
  const thumbQueue = useRef<Promise<void>>(Promise.resolve());
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
      settled,
      quick,
      context,
      legacyPhotos: legacy,
    });
    return [...built.fresh, ...built.existing].map((candidate) =>
      candidate.kind === "new" && renames[candidate.key] !== undefined
        ? { ...candidate, name: renames[candidate.key] as string }
        : candidate,
    );
  }, [related, relatedCandidate, context, discovered, labels, settled, quick, legacy, renames]);

  const fresh = candidates.filter((candidate) => candidate.kind === "new");
  const existing = candidates.filter(
    (candidate) => candidate.kind === "existing" && candidate.assets.length > 0,
  );
  const detail = candidates.find((candidate) => candidate.key === detailKey) ?? null;
  const review = reviewSelection(candidates, selection);

  // ---- thumbnails: only for what is on screen, one request at a time --------------

  const ensureThumbs = useCallback(
    (ids: readonly string[]) => {
      const wanted = ids.filter((id) => !requestedThumbs.current.has(id));
      if (wanted.length === 0) return;
      for (const id of wanted) requestedThumbs.current.add(id);
      thumbQueue.current = thumbQueue.current.then(async () => {
        for (let start = 0; start < wanted.length; start += 20) {
          if (!mounted.current) return;
          try {
            const batch = await client.thumbnails(wanted.slice(start, start + 20));
            if (!mounted.current) return;
            setThumbs((previous) => new Map([...previous, ...batch]));
          } catch {
            // A missing thumbnail is just a gray square.
          }
        }
      });
    },
    [client],
  );

  useEffect(() => {
    if (step !== "detail" || !detail) return;
    ensureThumbs(detail.assets.slice(0, visible).map((asset) => asset.nativeId));
  }, [step, detail, visible, ensureThumbs]);

  // The grid has every photo; its pictures are asked for in batches of PAGE as
  // the person scrolls (works for a fast flick too, since it reads the position).
  const loadMoreThumbnails = useCallback(() => {
    const element = bodyRef.current;
    const total = candidates.find((item) => item.key === detailKey)?.assets.length ?? 0;
    if (!element || visible >= total) return;
    const loadedEnd = element.scrollHeight * (visible / total);
    if (element.scrollTop + element.clientHeight >= loadedEnd - 400) {
      setVisible((value) => value + PAGE);
    }
  }, [candidates, detailKey, visible]);
  useEffect(() => {
    if (step === "detail") loadMoreThumbnails();
  }, [step, visible, loadMoreThumbnails]);

  useEffect(() => {
    if (step !== "review") return;
    for (const row of review.rows) {
      const candidate = candidates.find((item) => item.key === row.key);
      if (!candidate) continue;
      ensureThumbs(pickPreview(selectedAssets(candidate, selection), 3).map((asset) => asset.nativeId));
    }
  }, [step, review.rows, candidates, selection, ensureThumbs]);

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
        setDetailKey(candidate.key);
        setVisible(PAGE);
        setStep("detail");
        return;
      }

      if (outcome.assets.length === 0) {
        setEmptyReason(
          "Não encontramos fotos neste aparelho para analisar. Se você deu acesso só a algumas fotos, escolha mais.",
        );
        setStep("empty");
        return;
      }
      setDiscovered(discoverTrips(outcome.assets));
      setStep("trips");
    } catch (caught) {
      if (caught instanceof LibraryCancelledError || !mounted.current) return;
      setError(caught instanceof Error ? caught.message : "Não foi possível ler suas fotos.");
      setStep("intro");
    }
  }, [client, target]);

  const begin = useCallback(async () => {
    setError(null);
    try {
      const state = await client.ensureAccess();
      setAccess(state);
      if (state.canRead) await run();
      else if (!related) setStep("intro"); // blocked: say so (and offer Ajustes)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível pedir acesso às fotos.");
      if (!related) setStep("intro");
    }
  }, [client, run, related]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (related || autoStarted.current) return;
    autoStarted.current = true;
    void begin();
  }, [related, begin]);

  async function chooseMorePhotos() {
    try {
      await client.presentLimitedPicker();
      await run();
    } catch {
      setError("Não foi possível abrir a seleção de fotos.");
    }
  }

  // ---- instant state/country, offline, before any city name is known ------------------

  useEffect(() => {
    if (related || discovered.length === 0) return;
    let cancelled = false;
    (async () => {
      const geo = await loadAdminGeo();
      if (!geo || cancelled) return;
      const early: Record<string, QuickPlace> = {};
      for (const trip of discovered) {
        for (const stop of trip.stops) {
          const place = quickPlace(stop.center, geo);
          if (place) early[stop.id] = place;
        }
      }
      setQuick(early);
    })();
    return () => {
      cancelled = true;
    };
  }, [related, discovered]);

  // ---- naming the places (only a few centers are sent — never the library) --------

  useEffect(() => {
    if (related || discovered.length === 0) return;
    let cancelled = false;
    const stops = discovered.flatMap((trip) => trip.stops);
    const lookups = stops.slice(0, GEOCODE_MAX_STOPS);
    const unlooked = stops.slice(GEOCODE_MAX_STOPS);

    (async () => {
      const cities = await loadKnownCities();
      const offline = (stop: (typeof stops)[number]): string | undefined =>
        nearestKnownCity(stop.center, cities)?.name;

      // Stops beyond the lookup budget get the offline name (or none) right away.
      if (unlooked.length > 0 && !cancelled) {
        const names: Record<string, string> = {};
        for (const stop of unlooked) {
          const name = offline(stop);
          if (name) names[stop.id] = name;
        }
        setLabels((previous) => ({ ...previous, ...names }));
        setSettled((previous) => new Set([...previous, ...unlooked.map((stop) => stop.id)]));
      }

      for (let start = 0; start < lookups.length; start += GEOCODE_BATCH) {
        const batch = lookups.slice(start, start + GEOCODE_BATCH);
        let found: Record<string, string> = {};
        try {
          const response = await fetch("/api/geocode/reverse", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lookups: batch.map((stop) => ({
                id: stop.id,
                latitude: stop.center.latitude,
                longitude: stop.center.longitude,
                name: "Lugar 1",
                confirmedByUser: false,
              })),
            }),
          });
          if (response.ok) {
            found = ((await response.json()) as { labels?: Record<string, string> }).labels ?? {};
          }
        } catch {
          // Offline / rate-limited: the offline names below still apply.
        }
        if (cancelled) return;
        const names: Record<string, string> = {};
        for (const stop of batch) {
          const name = found[stop.id] ?? offline(stop);
          if (name) names[stop.id] = name;
        }
        setLabels((previous) => ({ ...previous, ...names }));
        setSettled((previous) => new Set([...previous, ...batch.map((stop) => stop.id)]));
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
        : experiencesToCheck(discovered, context, labels, settled).sort().join(","),
    [related, context, discovered, labels, settled],
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

  // ---- importing --------------------------------------------------------------

  async function importAll() {
    if (review.blocker) return;
    setError(null);
    setStep("importing");
    const controller = new AbortController();
    abortRef.current = controller;
    const done: ImportResult[] = [];

    for (const row of review.rows) {
      const candidate = candidates.find((item) => item.key === row.key);
      if (!candidate) continue;
      const label = row.kind === "new" ? row.name : row.title;
      const assets = selectedAssets(candidate, selection);
      try {
        setStatus(`Preparando as fotos de ${label || "esta viagem"}…`);
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
            name: row.name,
            ownerId: user.id,
            origins: exported.origins,
            onProgress: setStatus,
          });
          done.push({
            title: row.name,
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
          done.push({ title: label, added: 0, skipped: 0, href: null, error: "Cancelado.", warning: null });
          break;
        }
        if (caught instanceof TripLicenseError) {
          setLicenseBlock(caught.message);
          done.push({ title: label, added: 0, skipped: 0, href: null, error: caught.message, warning: null });
          break;
        }
        done.push({
          title: label,
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

  function openDetail(key: string) {
    setDetailKey(key);
    setVisible(PAGE);
    setStep("detail");
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

  const heading = related ? "Encontrar fotos" : "Encontrar uma viagem";

  const content = (() => {
    if (step === "intro") {
      return (
        <>
          <p className={styles.eyebrow}>✨ Moments Forever</p>
          <h2>{heading}</h2>
          {related ? (
            <>
              <p className={styles.hint}>
                Vamos procurar, nas fotos deste aparelho, as que combinam com as datas e os lugares desta viagem e que ainda não estão nela.
              </p>
              <p className={styles.hint}>
                Tudo acontece aqui no aparelho. Nada é enviado, importado ou criado sem você escolher e confirmar.
              </p>
            </>
          ) : null}
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
              {related ? "Cancelar" : "Fechar"}
            </button>
            <button className="button primary" onClick={() => void begin()} type="button">
              {related ? "Continuar" : "Tentar de novo"}
            </button>
          </div>
        </>
      );
    }

    if (step === "scanning") {
      return (
        <>
          <p className={styles.eyebrow}>✨ Moments Forever</p>
          <h2>{heading}</h2>
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
          <h2>{heading}</h2>
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
      const nothing = fresh.length === 0 && existing.length === 0;
      const renderCard = (candidate: Candidate) => (
        <li key={candidate.key}>
          <TripCard
            candidate={candidate}
            onOpen={() => openDetail(candidate.key)}
            onVisible={() =>
              ensureThumbs(
                pickPreview(candidate.assets, PREVIEW_COUNT).map((asset) => asset.nativeId),
              )
            }
            selection={selection}
            thumbs={thumbs}
          />
        </li>
      );
      return (
        <>
          <div>
            <p className={styles.eyebrow}>✨ Moments Forever</p>
            <h2>{fresh.length > 0 ? "Encontramos viagens nas suas fotos" : heading}</h2>
            <p className={styles.hint}>
              Toque numa viagem para ver as fotos. Só o que você marcar será adicionado.
            </p>
          </div>
          {limitedBanner}
          <div className={styles.body}>
            {nothing ? (
              <p className={styles.hint}>
                Não encontramos viagens novas nas fotos deste aparelho. O que achamos já está no Moments Forever.
              </p>
            ) : null}
            {fresh.length > 0 ? (
              <>
                <p className={styles.section}>Novas viagens</p>
                <ul className={styles.list}>{fresh.map(renderCard)}</ul>
              </>
            ) : null}
            {existing.length > 0 ? (
              <>
                <p className={styles.section}>Já no Moments Forever, com fotos novas</p>
                <ul className={styles.list}>{existing.map(renderCard)}</ul>
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
              disabled={review.tripCount === 0}
              onClick={() => setStep("review")}
              type="button"
            >
              {review.tripCount === 0
                ? "Revisar"
                : `Revisar · ${review.tripCount} viage${review.tripCount === 1 ? "m" : "ns"} · ${photosLabel(review.photoCount)}`}
            </button>
          </div>
        </>
      );
    }

    if (step === "detail" && detail) {
      const ticked = selection.get(detail.key) ?? new Set<string>();
      const count = selectedCount(detail, selection);
      const counts = describeCounts(detail.assets.length, count, detail.kind);
      return (
        <>
          <div className={styles.detailHead}>
            {related ? null : (
              <button
                aria-label="Voltar para as viagens"
                className={styles.back}
                onClick={() => setStep("trips")}
                type="button"
              >
                ‹
              </button>
            )}
            <div className={styles.detailTitleBlock}>
              <h2 className={styles.detailTitle}>
                <Flag code={detail.countryCode} />
                {related ? "Fotos que combinam com esta viagem" : detail.title || "Viagem"}
              </h2>
              <p className={styles.hint}>
                {related ? `${detail.title} · ` : ""}
                {formatPeriod(detail.period)}
                {detail.locationNote ? ` · ${detail.locationNote}` : ""}
              </p>
            </div>
          </div>
          <div className={styles.toolbar}>
            <span className={styles.toolbarCounts}>
              <span className={styles.countFound}>{counts.found}</span>
              <strong className={styles.countSelected} data-active={count > 0 ? "true" : "false"}>
                {counts.selected}
              </strong>
            </span>
            <span className={styles.toolbarActions}>
              <button
                className={styles.linkButton}
                onClick={() => setSelection((previous) => selectAll(previous, detail))}
                type="button"
              >
                Selecionar todas
              </button>
              <button
                className={styles.linkButton}
                onClick={() => setSelection((previous) => clearAll(previous, detail.key))}
                type="button"
              >
                Desmarcar todas
              </button>
            </span>
          </div>
          <div className={styles.body} onScroll={loadMoreThumbnails} ref={bodyRef}>
            <PhotoGrid
              assets={detail.assets}
              onToggle={(id) => setSelection((previous) => toggleAsset(previous, detail.key, id))}
              thumbs={thumbs}
              ticked={ticked}
            />
            {detail.withoutLocationCount > 0 ? (
              <p className={styles.stats}>
                {photosLabel(detail.withoutLocationCount)} sem localização foram incluídas pela data.
              </p>
            ) : null}
          </div>
          <div className={styles.actions}>
            {related ? (
              <>
                <button className="button secondary" onClick={onClose} type="button">
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={count === 0}
                  onClick={() => setStep("review")}
                  type="button"
                >
                  {count === 0 ? "Revisar" : `Revisar · ${photosLabel(count)}`}
                </button>
              </>
            ) : (
              <button className="button primary" onClick={() => setStep("trips")} type="button">
                {count === 0 ? "Voltar" : `Pronto · ${photosLabel(count)}`}
              </button>
            )}
          </div>
        </>
      );
    }

    if (step === "review") {
      return (
        <>
          <div>
            <p className={styles.eyebrow}>✨ Moments Forever</p>
            <h2>Pronto para adicionar</h2>
          </div>
          <div className={styles.body}>
            {review.rows.map((row) => {
              const candidate = candidates.find((item) => item.key === row.key);
              const previewIds = candidate
                ? pickPreview(selectedAssets(candidate, selection), 3).map((asset) => asset.nativeId)
                : [];
              return (
                <div className={styles.reviewRow} key={row.key}>
                  <div className={styles.reviewTop}>
                    <span className={styles.reviewTitle}>
                      <Flag code={candidate?.countryCode ?? null} />
                      {row.title || "Nova viagem"}
                    </span>
                    <strong>{photosLabel(row.selected)}</strong>
                  </div>
                  {row.kind === "new" ? (
                    <input
                      aria-label="Nome da viagem"
                      className={styles.nameInput}
                      maxLength={80}
                      onChange={(event) =>
                        setRenames((previous) => ({ ...previous, [row.key]: event.target.value }))
                      }
                      placeholder="Nome da viagem"
                      type="text"
                      value={candidate?.name ?? row.name}
                    />
                  ) : (
                    <span className={styles.rowMeta}>Entra na viagem que você já tem</span>
                  )}
                  <PreviewStrip
                    ids={previewIds}
                    size="small"
                    thumbs={thumbs}
                    total={row.selected}
                  />
                </div>
              );
            })}
            <p className={styles.summaryTotal}>
              Total: {review.tripCount} viage{review.tripCount === 1 ? "m" : "ns"} · {photosLabel(review.photoCount)}
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
            <button
              className="button secondary"
              onClick={() => setStep(related ? "detail" : "trips")}
              type="button"
            >
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
        if (
          event.target === event.currentTarget &&
          (step === "intro" || step === "empty" || step === "done")
        ) {
          onClose();
        }
      }}
      role="presentation"
    >
      <PageScrollLock />
      <div aria-label={heading} aria-modal="true" className={styles.card} role="dialog">
        {content}
      </div>
    </div>,
    document.body,
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  buildExperienceDraftFromImport,
  createPhotoGroup,
  deselectAll,
  groupPhotos,
  groupsForOrganizationMode,
  importDiagnostics,
  isValidPhotoGroupPartition,
  mergePhotoGroups,
  movePhotosToGroup,
  movePhotosToUnknown,
  readySummary,
  selectAll,
  selectionTotals,
  suggestExperienceSlug,
  suggestExperienceTitle,
  suggestImportRootName,
  toggleGroup,
  togglePhoto,
  type LocalPhotoMetadata,
  type PhotoImportGroup,
  type PhotoSelectionState,
} from "@moments-forever/shared";

import { AppWordmark } from "@/components/app-wordmark";
import { useAuth } from "@/components/auth-provider";
import {
  enrichImportGroupLabels,
  mergeEnrichedGroupLabels,
} from "@/lib/location/enrich-import-groups";
import { putLocalPhotoBlobs } from "@/lib/local-photos/photo-blob-store";
import type { BrowserWorkerResult } from "@/lib/photo-import/browser-worker-types";
import {
  getStagedImportFilesForBoot,
  IMPORT_FILE_ACCEPT,
} from "@/lib/photo-import/pending-import-files";
import { uploadManyPhotoBlobsToR2 } from "@/lib/storage/upload-photo-to-r2";

import styles from "./photo-import.module.css";

const CHUNK_SIZE = 8;
const PAGE_SIZE = 24;

type Screen =
  | "start"
  | "analyzing"
  | "results"
  | "creating"
  | "ready";

function formatBytes(bytes: number): string {
  const units = [
    { minimum: 1_000_000_000, divisor: 1_000_000_000, unit: "gigabyte" },
    { minimum: 1_000_000, divisor: 1_000_000, unit: "megabyte" },
    { minimum: 1_000, divisor: 1_000, unit: "kilobyte" },
  ] as const;
  const selectedUnit = units.find(({ minimum }) => bytes >= minimum);
  if (!selectedUnit) return `${bytes} B`;
  return new Intl.NumberFormat("pt-BR", {
    style: "unit",
    unit: selectedUnit.unit,
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(bytes / selectedUnit.divisor);
}

function dateSourceLabel(photo: LocalPhotoMetadata): string {
  if (photo.dateSource === "exif") return "Data registrada nos metadados EXIF";
  if (photo.dateSource === "file-last-modified") {
    return "Data de modificação do arquivo (referência, não data de captura)";
  }
  return "Data desconhecida";
}

function makePhotoId(index: number): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `photo-${Date.now()}-${index}`;
}

function makeManualGroupId(index: number): string {
  return typeof crypto.randomUUID === "function"
    ? `manual-${crypto.randomUUID()}`
    : `manual-${Date.now()}-${index}`;
}

function toggleId(ids: readonly string[], id: string): readonly string[] {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return [...next];
}

function isSupportedImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "heic",
    "heif",
    "dng",
    "cr2",
    "cr3",
    "nef",
    "arw",
    "raf",
  ].includes(extension ?? "");
}

function isBrowserDisplayableImage(file: File): boolean {
  const type = file.type.toLowerCase();
  if (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    type === "image/gif" ||
    type === "image/bmp"
  ) {
    return true;
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(extension ?? "");
}

function fileExtension(name: string): string | null {
  const extension = name.split(".").pop()?.trim().toLowerCase();
  return extension && extension !== name.toLowerCase() ? extension : null;
}

function LazyThumbnail({
  alt,
  blobUrl,
  fallbackFile,
}: {
  readonly alt: string;
  readonly blobUrl: string | null;
  readonly fallbackFile: File | undefined;
}) {
  const [fallbackUrl] = useState<string | null>(() =>
    blobUrl || !fallbackFile ? null : URL.createObjectURL(fallbackFile),
  );
  useEffect(
    () => () => {
      if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
    },
    [fallbackUrl],
  );

  const source = blobUrl ?? fallbackUrl;
  return source ? (
    // Browser decoding is lazy and limited to the current 24-item page.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} loading="lazy" decoding="async" src={source} />
  ) : (
    <span aria-hidden="true">Foto</span>
  );
}

function PhotoPreview({
  photo,
  file,
  onClose,
}: {
  readonly photo: LocalPhotoMetadata;
  readonly file: File | undefined;
  readonly onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    const publishUrl = window.setTimeout(() => setUrl(nextUrl), 0);
    return () => {
      window.clearTimeout(publishUrl);
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      aria-labelledby="photo-preview-title"
      aria-modal="true"
      className={styles.dialogBackdrop}
      role="dialog"
    >
      <div className={styles.dialog}>
        <button
          className={styles.closeButton}
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          Fechar
        </button>
        {url ? (
          // This URL exists only while the active preview is open.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={photo.name} className={styles.previewImage} src={url} />
        ) : null}
        <h2 id="photo-preview-title">{photo.name}</h2>
        <dl className={styles.details}>
          <div>
            <dt>Data</dt>
            <dd>
              {photo.date
                ? new Date(photo.date).toLocaleString("pt-BR")
                : "Desconhecida"}
              <small>{dateSourceLabel(photo)}</small>
            </dd>
          </div>
          <div>
            <dt>Local</dt>
            <dd>
              {photo.gps
                ? `${photo.gps.latitude.toFixed(4)}, ${photo.gps.longitude.toFixed(4)}`
                : "Local desconhecido"}
            </dd>
          </div>
          <div>
            <dt>Arquivo</dt>
            <dd>
              {photo.type} · {formatBytes(photo.size)}
            </dd>
          </div>
          <div>
            <dt>Dimensões</dt>
            <dd>
              {photo.dimensions
                ? `${photo.dimensions.width} × ${photo.dimensions.height}`
                : "Desconhecidas"}
            </dd>
          </div>
        </dl>
        {photo.warnings.length > 0 ? (
          <ul className={styles.warnings}>
            {photo.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function GroupSection({
  group,
  photosById,
  selected,
  reviewMode,
  reviewSelected,
  reviewGroupSelected,
  files,
  thumbnailUrls,
  onToggleGroup,
  onTogglePhoto,
  onToggleReviewGroup,
  onToggleReviewPhoto,
  onPreview,
}: {
  readonly group: PhotoImportGroup;
  readonly photosById: ReadonlyMap<string, LocalPhotoMetadata>;
  readonly selected: ReadonlySet<string>;
  readonly reviewMode: boolean;
  readonly reviewSelected: ReadonlySet<string>;
  readonly reviewGroupSelected: boolean;
  readonly files: ReadonlyMap<string, File>;
  readonly thumbnailUrls: ReadonlyMap<string, string>;
  readonly onToggleGroup: () => void;
  readonly onTogglePhoto: (id: string) => void;
  readonly onToggleReviewGroup: () => void;
  readonly onToggleReviewPhoto: (id: string) => void;
  readonly onPreview: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const selectedCount = group.photoIds.filter((id) => selected.has(id)).length;
  const visibleIds = group.photoIds.slice(0, visible);

  return (
    <section
      className={`${styles.group} ${reviewGroupSelected ? styles.reviewGroupSelected : ""}`}
    >
      <div className={styles.groupCard}>
        <div className={styles.groupHeading}>
          {reviewMode ? (
            <button
              aria-label={`${reviewGroupSelected ? "Desmarcar" : "Marcar"} lugar ${group.label} para união`}
              aria-pressed={reviewGroupSelected}
              className={styles.reviewGroupCheck}
              onClick={onToggleReviewGroup}
              type="button"
            >
              <span aria-hidden="true">{reviewGroupSelected ? "✓" : "○"}</span>
              Unir
            </button>
          ) : (
            <button
              aria-label={`${selectedCount === group.photoIds.length ? "Desmarcar" : "Selecionar"} lugar ${group.label}`}
              className={styles.groupCheck}
              onClick={onToggleGroup}
              type="button"
            >
              <span aria-hidden="true">
                {selectedCount === group.photoIds.length ? "✓" : "○"}
              </span>
              {selectedCount}/{group.photoIds.length}
            </button>
          )}
          <button
            aria-expanded={expanded}
            className={styles.expandButton}
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            <span>
              <strong className={styles.groupLabel}>
                {group.kind === "location" ||
                group.kind === "location-temporal" ||
                group.kind === "manual" ? (
                  <>
                    <span aria-hidden="true">📍 </span>
                    {group.label}
                  </>
                ) : (
                  group.label
                )}
              </strong>
              <small>
                {group.photoIds.length} foto
                {group.photoIds.length === 1 ? "" : "s"}
                {expanded ? "" : " · ver todas"}
              </small>
            </span>
            <span aria-hidden="true">{expanded ? "−" : "+"}</span>
          </button>
        </div>

        {expanded ? (
          <>
            <div className={styles.thumbnailGrid}>
              {visibleIds.map((id) => {
                const photo = photosById.get(id);
                if (!photo) return null;
                return (
                  <div
                    className={`${styles.thumbnailItem} ${reviewSelected.has(id) ? styles.reviewPhotoSelected : ""}`}
                    key={id}
                  >
                    <button
                      aria-label={`Abrir prévia de ${photo.name}`}
                      className={styles.photoButton}
                      onClick={() => onPreview(id)}
                      type="button"
                    >
                      <LazyThumbnail
                        alt=""
                        blobUrl={thumbnailUrls.get(id) ?? null}
                        fallbackFile={files.get(id)}
                      />
                    </button>
                    {reviewMode ? (
                      <button
                        aria-pressed={reviewSelected.has(id)}
                        className={styles.reviewSelectPhoto}
                        onClick={() => onToggleReviewPhoto(id)}
                        type="button"
                      >
                        {reviewSelected.has(id)
                          ? "Marcada para organizar"
                          : "Marcar para organizar"}
                      </button>
                    ) : (
                      <button
                        aria-pressed={selected.has(id)}
                        className={styles.selectPhoto}
                        onClick={() => onTogglePhoto(id)}
                        type="button"
                      >
                        {selected.has(id) ? "Selecionada" : "Selecionar"}
                      </button>
                    )}
                    {photo.duplicateOf ? (
                      <span className={styles.duplicate}>Possível duplicata</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {visible < group.photoIds.length ? (
              <button
                className={styles.moreButton}
                onClick={() => setVisible((value) => value + PAGE_SIZE)}
                type="button"
              >
                Mostrar mais{" "}
                {Math.min(PAGE_SIZE, group.photoIds.length - visible)}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

export function PhotoImport() {
  const router = useRouter();
  const { configured, loading: authLoading, user } = useAuth();
  const [stagedFiles] = useState(() => getStagedImportFilesForBoot());
  const [screen, setScreen] = useState<Screen>(
    stagedFiles != null ? "analyzing" : "start",
  );
  const stagedBootDoneRef = useRef(false);
  const [photos, setPhotos] = useState<readonly LocalPhotoMetadata[]>([]);
  const [groups, setGroups] = useState<readonly PhotoImportGroup[]>([]);
  const [selection, setSelection] = useState<PhotoSelectionState>({
    selectedIds: [],
  });
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewPhotoIds, setReviewPhotoIds] = useState<readonly string[]>([]);
  const [reviewGroupIds, setReviewGroupIds] = useState<readonly string[]>([]);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [fileRegistry] = useState(() => new Map<string, File>());
  const workerRef = useRef<Worker | null>(null);
  const pendingPhotosRef = useRef<LocalPhotoMetadata[]>([]);
  const thumbnailUrlsRef = useRef(new Map<string, string>());
  const thumbnailBlobsRef = useRef(new Map<string, Blob>());
  const pendingCompletedRef = useRef(0);
  const progressFrameRef = useRef<number | null>(null);
  const manualGroupCounterRef = useRef(0);
  const persistingRef = useRef(false);

  const photosById = useMemo(
    () => new Map(photos.map((photo) => [photo.id, photo])),
    [photos],
  );
  const selectedSet = useMemo(
    () => new Set(selection.selectedIds),
    [selection],
  );
  const reviewSelectedSet = useMemo(
    () => new Set(reviewPhotoIds),
    [reviewPhotoIds],
  );
  const reviewGroupSet = useMemo(
    () => new Set(reviewGroupIds),
    [reviewGroupIds],
  );
  const reviewSourceGroups = useMemo(
    () =>
      groups.filter((group) =>
        group.photoIds.some((id) => reviewSelectedSet.has(id)),
      ),
    [groups, reviewSelectedSet],
  );
  const selectedPhotosAreStrictSubset =
    reviewSourceGroups.length === 1 &&
    reviewPhotoIds.length > 0 &&
    reviewPhotoIds.length < (reviewSourceGroups[0]?.photoIds.length ?? 0);
  const moveTarget = groups.find((group) => group.id === moveTargetId);
  const canMoveToTarget =
    reviewPhotoIds.length > 0 &&
    Boolean(
      moveTarget &&
        reviewPhotoIds.some((id) => !moveTarget.photoIds.includes(id)),
    );
  const unknownGroup = groups.find((group) => group.id === "unknown");
  const canMoveToUnknown =
    reviewPhotoIds.length > 0 &&
    reviewPhotoIds.some((id) => !unknownGroup?.photoIds.includes(id));
  const totals = useMemo(
    () => selectionTotals(selection, photos),
    [selection, photos],
  );
  const originalBytes = useMemo(
    () => photos.reduce((sum, photo) => sum + photo.size, 0),
    [photos],
  );

  function revokeThumbnails(): void {
    thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    thumbnailUrlsRef.current.clear();
    thumbnailBlobsRef.current.clear();
    setThumbnailUrls(new Map());
  }

  function clearSession(): void {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (progressFrameRef.current !== null) {
      cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
    pendingCompletedRef.current = 0;
    pendingPhotosRef.current = [];
    revokeThumbnails();
    fileRegistry.clear();
    setPhotos([]);
    setGroups([]);
    setSelection(deselectAll());
    setReviewMode(false);
    setReviewPhotoIds([]);
    setReviewGroupIds([]);
    setMoveTargetId("");
    setReviewError(null);
    setPersistError(null);
    setCreatedSlug(null);
    setErrors([]);
    setCompleted(0);
    setTotal(0);
    setPreviewId(null);
    manualGroupCounterRef.current = 0;
    persistingRef.current = false;
  }

  function reset(): void {
    clearSession();
    setScreen("start");
  }

  const experienceTitlePreview = useMemo(
    () =>
      suggestExperienceTitle({
        groups,
        selectedIds: selection.selectedIds,
        photos,
      }),
    [groups, photos, selection.selectedIds],
  );

  async function continueToExperience(): Promise<void> {
    setPersistError(null);
    if (!configured) {
      setPersistError(
        "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para o Supabase local.",
      );
      return;
    }
    if (authLoading) {
      setPersistError("Aguarde a verificação da sessão.");
      return;
    }
    if (!user) {
      setPersistError("Entre na sua conta para criar a experiência.");
      return;
    }
    if (!isValidPhotoGroupPartition(groups, photos.map((photo) => photo.id))) {
      setPersistError("Os grupos estão inconsistentes. Revise a seleção.");
      return;
    }
    if (selection.selectedIds.length === 0) {
      setPersistError("Selecione pelo menos uma foto.");
      return;
    }
    if (persistingRef.current || totals.count === 0) {
      return;
    }

    persistingRef.current = true;
    setScreen("creating");

    try {
      const title = experienceTitlePreview;
      const slug = suggestExperienceSlug(title);
      // One place folder per GPS cluster. GPS on photos is never altered.
      const rootName = suggestImportRootName(
        groups,
        selection.selectedIds,
        title,
      );
      const draftGroups = groupsForOrganizationMode(
        "separate",
        groups,
        selection.selectedIds,
        rootName,
        photos,
      );
      const draft = buildExperienceDraftFromImport({
        ownerId: user.id,
        title,
        slug,
        photos,
        groups: draftGroups,
        selectedIds: selection.selectedIds,
      });

      if (draft.photos.length === 0 || draft.moments.length === 0) {
        throw new Error("Nenhum momento/foto válido para persistir.");
      }

      const localBlobs = draft.photos.flatMap((photo) => {
        const file = fileRegistry.get(photo.id);
        const thumbnail = thumbnailBlobsRef.current.get(photo.id) ?? null;
        const full =
          file && isBrowserDisplayableImage(file)
            ? file
            : (thumbnail ?? file ?? null);
        return full
          ? [{ id: photo.id, full, thumbnail }]
          : [];
      });
      await putLocalPhotoBlobs(localBlobs);

      const response = await fetch("/api/experiences/from-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const body = (await response.json()) as {
        readonly id?: string;
        readonly slug?: string;
        readonly error?: string;
      };
      if (!response.ok || !body.slug || !body.id) {
        throw new Error(body.error ?? "Não foi possível criar a experiência.");
      }

      // Permanent store: IndexedDB remains a local cache.
      try {
        await uploadManyPhotoBlobsToR2(body.id, localBlobs);
      } catch {
        // Metadata already persisted; photos remain visible via IndexedDB.
        // User can re-open and we can retry upload later.
      }

      setCreatedSlug(body.slug);
      setScreen("ready");
      router.push("/perfil");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível criar a experiência.";
      setPersistError(message);
      setScreen("results");
    } finally {
      persistingRef.current = false;
    }
  }

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (progressFrameRef.current !== null) {
        cancelAnimationFrame(progressFrameRef.current);
      }
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  function clearReviewSelection(): void {
    setReviewPhotoIds([]);
    setReviewGroupIds([]);
    setMoveTargetId("");
    setReviewError(null);
  }

  function toggleReviewMode(): void {
    setReviewMode((current) => !current);
    clearReviewSelection();
  }

  function applyGroupReview(
    operation: (
      currentGroups: readonly PhotoImportGroup[],
    ) => readonly PhotoImportGroup[],
  ): void {
    try {
      const nextGroups = operation(groups);
      setGroups(nextGroups);
      clearReviewSelection();
      void enrichImportGroupLabels(nextGroups, photos).then((enriched) => {
        setGroups((current) => mergeEnrichedGroupLabels(current, enriched));
      });
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : "Não foi possível organizar os grupos.",
      );
    }
  }

  function beginResultsWithGroups(
    analyzedPhotos: readonly LocalPhotoMetadata[],
  ): void {
    const grouped = groupPhotos(analyzedPhotos);
    setPhotos(analyzedPhotos);
    setGroups(grouped);
    setThumbnailUrls(new Map(thumbnailUrlsRef.current));
    setSelection(selectAll(analyzedPhotos.map(({ id }) => id)));
    setScreen("results");
    void enrichImportGroupLabels(grouped, analyzedPhotos).then((enriched) => {
      setGroups((current) => mergeEnrichedGroupLabels(current, enriched));
    });
  }

  function beginAnalysis(files: readonly File[]): void {
    const chosen = files.filter(isSupportedImageFile);
    if (chosen.length === 0) {
      setScreen("start");
      setErrors(["Escolha pelo menos um arquivo de imagem."]);
      return;
    }

    clearSession();
    const entries = chosen.map((file, index) => ({
      id: makePhotoId(index),
      file,
    }));
    entries.forEach(({ id, file }) => fileRegistry.set(id, file));
    setTotal(entries.length);
    setScreen("analyzing");

    const worker = new Worker(
      new URL("./photo-import.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (workerEvent: MessageEvent<BrowserWorkerResult>) => {
      const message = workerEvent.data;
      if (message.type === "item") {
        pendingPhotosRef.current.push(message.metadata);
        if (message.thumbnail) {
          thumbnailBlobsRef.current.set(
            message.metadata.id,
            message.thumbnail,
          );
          const url = URL.createObjectURL(message.thumbnail);
          thumbnailUrlsRef.current.set(message.metadata.id, url);
        }
      } else if (message.type === "progress") {
        pendingCompletedRef.current = message.completed;
        if (progressFrameRef.current === null) {
          progressFrameRef.current = requestAnimationFrame(() => {
            setCompleted(pendingCompletedRef.current);
            progressFrameRef.current = null;
          });
        }
      } else if (message.type === "error") {
        setErrors((current) => [
          ...current,
          `Uma foto não pôde ser analisada: ${message.message}`,
        ]);
      } else {
        worker.terminate();
        workerRef.current = null;
        if (progressFrameRef.current !== null) {
          cancelAnimationFrame(progressFrameRef.current);
          progressFrameRef.current = null;
        }
        setCompleted(entries.length);
        if (!message.cancelled) {
          beginResultsWithGroups([...pendingPhotosRef.current]);
        }
      }
    };
    worker.onerror = () => {
      worker.terminate();
      workerRef.current = null;
      setErrors(["A análise local foi interrompida pelo navegador."]);
      beginResultsWithGroups([...pendingPhotosRef.current]);
    };
    worker.postMessage({
      type: "analyze",
      files: entries,
      chunkSize: CHUNK_SIZE,
    });
  }

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>): void {
    const chosen = [...(event.target.files ?? [])];
    event.target.value = "";
    beginAnalysis(chosen);
  }

  useEffect(() => {
    if (!stagedFiles || stagedBootDoneRef.current) return;
    stagedBootDoneRef.current = true;
    beginAnalysis(stagedFiles);
    // Boot once from "Nova viagem" handoff; beginAnalysis is stable per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount handoff only
  }, [stagedFiles]);

  function createGroupFromReviewSelection(): void {
    const nextIndex = manualGroupCounterRef.current + 1;
    manualGroupCounterRef.current = nextIndex;
    applyGroupReview((currentGroups) =>
      createPhotoGroup(
        currentGroups,
        reviewPhotoIds,
        makeManualGroupId(nextIndex),
        `Lugar ${nextIndex}`,
      ),
    );
  }

  function moveReviewSelection(): void {
    applyGroupReview((currentGroups) =>
      movePhotosToGroup(currentGroups, reviewPhotoIds, moveTargetId),
    );
  }

  function moveReviewSelectionToUnknown(): void {
    applyGroupReview((currentGroups) =>
      movePhotosToUnknown(currentGroups, reviewPhotoIds),
    );
  }

  function mergeReviewGroups(): void {
    const nextIndex = manualGroupCounterRef.current + 1;
    manualGroupCounterRef.current = nextIndex;
    applyGroupReview((currentGroups) =>
      mergePhotoGroups(
        currentGroups,
        reviewGroupIds,
        makeManualGroupId(nextIndex),
        `Lugar ${nextIndex}`,
      ),
    );
  }

  const previewPhoto = previewId ? photosById.get(previewId) : undefined;
  const summary = readySummary(selection, photos, groups);
  const diagnostics =
    process.env.NODE_ENV === "development"
      ? {
          summary: importDiagnostics(
            photos,
            groups,
            selection,
            (
              performance as Performance & {
                readonly memory?: { readonly usedJSHeapSize?: number };
              }
            ).memory?.usedJSHeapSize ?? null,
          ),
          files: photos.map((photo) => {
            const gpsFieldsFound = photo.exif.availableFields.filter((field) =>
              /gps|latitude|longitude/i.test(field),
            );
            return {
              name: photo.name,
              type: photo.type,
              size: photo.size,
              extension: fileExtension(photo.name),
              exifFieldsFound: photo.exif.availableFields,
              hasGPSLatitude: photo.exif.availableFields.includes("GPSLatitude"),
              hasGPSLongitude:
                photo.exif.availableFields.includes("GPSLongitude"),
              gpsFieldsFound,
              derivedGps: photo.gps,
            };
          }),
        }
      : null;

  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Importação de fotos">
        <AppWordmark />
        {screen !== "start" ? (
          <button className="link-button" onClick={reset} type="button">
            Recomeçar
          </button>
        ) : null}
      </nav>

      {screen === "start" ? (
        <section className={styles.intro}>
          <p className="eyebrow">Organização local</p>
          <h1>Escolha as fotos que contam a história.</h1>
          <p className={styles.lead}>
            Selecione arquivos de imagem neste navegador. A análise acontece
            neste dispositivo e nada é enviado.
          </p>
          <label className={`button primary ${styles.fileButton}`}>
            Adicionar fotos
            <input
              accept={IMPORT_FILE_ACCEPT}
              className={styles.hiddenInput}
              multiple
              onChange={onFilesSelected}
              type="file"
            />
          </label>
          <small className={styles.browserNote}>
            O navegador abre o seletor de arquivos disponível no seu aparelho;
            não acessa silenciosamente a biblioteca do iPhone.
          </small>
          {errors.map((error) => (
            <p className={styles.error} key={error} role="alert">
              {error}
            </p>
          ))}
        </section>
      ) : null}

      {screen === "analyzing" ? (
        <section className={styles.analyzing} aria-live="polite">
          <p className="eyebrow">Análise local</p>
          <h1>Encontrando os detalhes das suas fotos.</h1>
          <p className={styles.progressText}>
            {completed}/{total}
          </p>
          <progress
            aria-label={`${completed} de ${total} fotos analisadas`}
            className={styles.progress}
            max={total}
            value={completed}
          />
          <p className={styles.lead}>
            Lemos somente metadados necessários e criamos pequenas prévias
            quando o navegador permite.
          </p>
          <button className="button secondary" onClick={reset} type="button">
            Cancelar
          </button>
        </section>
      ) : null}

      {screen === "results" ? (
        <section className={styles.results}>
          <header className={styles.resultsHeader}>
            <div>
              <p className="eyebrow">Sua seleção</p>
              <h1>Sua viagem</h1>
              <p className={styles.resultsSummary}>
                {totals.count} foto{totals.count === 1 ? "" : "s"} ·{" "}
                {groups.length} lugar{groups.length === 1 ? "" : "es"}
              </p>
            </div>
            <div className={styles.selectionActions}>
              <button
                className="link-button"
                onClick={() =>
                  setSelection(selectAll(photos.map(({ id }) => id)))
                }
                type="button"
              >
                Selecionar tudo
              </button>
              <span aria-hidden="true" className={styles.selectionDivider}>
                ·
              </span>
              <button
                className="link-button"
                onClick={() => setSelection(deselectAll())}
                type="button"
              >
                Desmarcar
              </button>
            </div>
          </header>

          <section className={styles.reviewMode}>
            <div>
              <strong>Juntar pastas</strong>
              <p>
                Marque lugares iguais com Unir e una sem mudar quais fotos
                entram na viagem.
              </p>
            </div>
            <button
              aria-pressed={reviewMode}
              className={`button ${reviewMode ? "secondary" : "primary"}`}
              onClick={toggleReviewMode}
              type="button"
            >
              {reviewMode ? "Concluir" : "Ajustar lugares"}
            </button>
          </section>

          {reviewMode ? (
            <section
              aria-label="Ações de organização dos lugares"
              className={styles.reviewToolbar}
            >
              <p className={styles.reviewHint}>
                Marque 2 lugares iguais e toque em Unir.
              </p>
              <div className={styles.reviewCounts} aria-live="polite">
                <strong>{reviewPhotoIds.length} fotos marcadas</strong>
                <span>{reviewGroupIds.length} lugares marcados</span>
              </div>
              {reviewPhotoIds.length > 0 ? (
                <div className={styles.reviewActions}>
                  <button
                    className="button secondary"
                    onClick={createGroupFromReviewSelection}
                    type="button"
                  >
                    {selectedPhotosAreStrictSubset
                      ? "Dividir em novo lugar"
                      : "Criar lugar"}
                  </button>
                  <label className={styles.moveTarget}>
                    <span>Mover para</span>
                    <select
                      onChange={(event) => setMoveTargetId(event.target.value)}
                      value={moveTargetId}
                    >
                      <option value="">Escolha um lugar</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.label} · {group.photoIds.length}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={!canMoveToTarget}
                    onClick={moveReviewSelection}
                    type="button"
                  >
                    Mover fotos
                  </button>
                  <button
                    className="link-button"
                    disabled={!canMoveToUnknown}
                    onClick={moveReviewSelectionToUnknown}
                    type="button"
                  >
                    Mover para Desconhecido
                  </button>
                </div>
              ) : null}
              {reviewGroupIds.length >= 2 ? (
                <button
                  className="button secondary"
                  onClick={mergeReviewGroups}
                  type="button"
                >
                  Unir {reviewGroupIds.length} lugares
                </button>
              ) : null}
              {reviewPhotoIds.length > 0 || reviewGroupIds.length > 0 ? (
                <button
                  className="link-button"
                  onClick={clearReviewSelection}
                  type="button"
                >
                  Limpar marcações
                </button>
              ) : null}
              {reviewError ? (
                <p className={styles.error} role="alert">
                  {reviewError}
                </p>
              ) : null}
            </section>
          ) : null}

          {errors.map((error) => (
            <p className={styles.error} key={error} role="alert">
              {error}
            </p>
          ))}

          <div className={styles.groups}>
            {groups.map((group) => (
              <GroupSection
                files={fileRegistry}
                group={group}
                key={group.id}
                onPreview={setPreviewId}
                onToggleReviewGroup={() =>
                  setReviewGroupIds((current) => toggleId(current, group.id))
                }
                onToggleReviewPhoto={(id) =>
                  setReviewPhotoIds((current) => toggleId(current, id))
                }
                onToggleGroup={() =>
                  setSelection((current) =>
                    toggleGroup(current, group.photoIds),
                  )
                }
                onTogglePhoto={(id) =>
                  setSelection((current) => togglePhoto(current, id))
                }
                photosById={photosById}
                reviewGroupSelected={reviewGroupSet.has(group.id)}
                reviewMode={reviewMode}
                reviewSelected={reviewSelectedSet}
                selected={selectedSet}
                thumbnailUrls={thumbnailUrls}
              />
            ))}
          </div>

          {persistError ? (
            <p className={styles.error} role="alert">
              {persistError}
            </p>
          ) : null}
          {!user && configured && !authLoading ? (
            <p className={styles.unsent}>
              <Link href="/login">Entre na conta</Link> para salvar a
              experiência no Supabase local.
            </p>
          ) : null}

          {diagnostics ? (
            <details className={styles.diagnostics}>
              <summary>Diagnóstico local</summary>
              <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
            </details>
          ) : null}

          <div className={styles.stickyBar}>
            <p className={styles.stickyMeta}>
              {formatBytes(originalBytes)} neste aparelho
            </p>
            <button
              className={`button primary ${styles.continueButton}`}
              disabled={totals.count === 0 || authLoading}
              onClick={() => {
                void continueToExperience();
              }}
              type="button"
            >
              Importar {totals.count} foto{totals.count === 1 ? "" : "s"}
            </button>
          </div>
        </section>
      ) : null}

      {screen === "creating" ? (
        <section className={styles.ready}>
          <p className="eyebrow">Persistência local</p>
          <h1>Criando experiência…</h1>
          <p className={styles.unsent}>
            Salvando metadados no Supabase local. As fotos originais não são
            enviadas nesta etapa.
          </p>
        </section>
      ) : null}

      {screen === "ready" ? (
        <section className={styles.ready}>
          <p className="eyebrow">Experiência criada</p>
          <h1>Persistência concluída</h1>
          <p className={styles.unsent}>
            Metadados salvos. As fotos ainda não foram enviadas.
          </p>
          <dl className={styles.readySummary}>
            <div>
              <dt>Fotos selecionadas</dt>
              <dd>{summary.selectedCount}</dd>
            </div>
            <div>
              <dt>Grupos incluídos</dt>
              <dd>{summary.selectedGroupCount}</dd>
            </div>
            <div>
              <dt>Tamanho original</dt>
              <dd>{formatBytes(summary.selectedOriginalBytes)}</dd>
            </div>
          </dl>
          {createdSlug ? (
            <Link
              className="button primary"
              href="/perfil"
            >
              Abrir experiência
            </Link>
          ) : null}
          <button
            className="button secondary"
            onClick={() => setScreen("results")}
            type="button"
          >
            Voltar
          </button>
        </section>
      ) : null}

      {previewPhoto ? (
        <PhotoPreview
          file={fileRegistry.get(previewPhoto.id)}
          key={previewPhoto.id}
          onClose={() => setPreviewId(null)}
          photo={previewPhoto}
        />
      ) : null}
    </main>
  );
}

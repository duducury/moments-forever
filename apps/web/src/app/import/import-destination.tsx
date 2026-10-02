"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";

import { countryCodeFromPlaceLabel } from "@moments-forever/shared";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import { useAuth } from "@/components/auth-provider";
import { parseBrowserExifFields } from "@/lib/photo-import/browser-metadata";
import { IMPORT_FILE_ACCEPT } from "@/lib/photo-import/pending-import-files";
import {
  createNamedTripFromFiles,
  TripLicenseError,
  type TripLicenseErrorCode,
} from "@/lib/photos/create-named-trip-from-files";
import { uploadFilesToAlbum } from "@/lib/photos/upload-files-to-album";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

import styles from "./photo-import.module.css";

/** Only the first files are checked — a single-place trip's GPS shows up fast. */
const MAX_FILES_TO_SCAN_FOR_GPS = 15;

interface DestinationAlbum {
  readonly albumId: string;
  readonly experienceId: string;
  readonly experienceSlug: string;
  readonly title: string;
  readonly coverPhotoId: string | null;
  readonly countryCode: string | null;
  readonly photoCount: number;
}

type DestinationMode = "choose" | "new" | "existing";

/** Purely derived from the File's own fields — no impure calls, stable across reorders. */
function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** Drag threshold in pixels before a press counts as a reorder drag, not a tap. */
const DRAG_THRESHOLD_PX = 6;

function SelectedPhotoItem({
  file,
  isCover,
  busy,
  onRemove,
  onDragOverKey,
  onSetCover,
}: {
  readonly file: File;
  readonly isCover: boolean;
  readonly busy: boolean;
  readonly onRemove: () => void;
  readonly onDragOverKey: (targetKey: string) => void;
  readonly onSetCover: () => void;
}) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const [dragOffset, setDragOffset] = useState<{
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const dragOriginRef = useRef({ x: 0, y: 0 });

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (busy || (event.button !== 0 && event.pointerType === "mouse")) return;
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - dragOriginRef.current.x;
    const dy = event.clientY - dragOriginRef.current.y;
    if (
      !dragOffset &&
      Math.abs(dx) < DRAG_THRESHOLD_PX &&
      Math.abs(dy) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    event.preventDefault();
    setDragOffset({ x: dx, y: dy });
    const under = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-file-key]");
    const targetKey = under?.dataset.fileKey;
    if (targetKey) onDragOverKey(targetKey);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragOffset(null);
  }

  return (
    <li className={styles.selectedPhotoItem} data-file-key={fileKey(file)}>
      <div
        className={`${styles.selectedPhotoThumb} ${dragOffset ? styles.selectedPhotoThumbDragging : ""}`}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={
          dragOffset
            ? {
                transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
              }
            : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        <img alt="" className={styles.selectedPhotoImage} src={url} />
        <button
          aria-label={`Remover ${file.name}`}
          className={styles.selectedPhotoRemove}
          disabled={busy}
          onClick={onRemove}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          ×
        </button>
        <button
          aria-label={isCover ? "Foto de capa" : "Definir como capa"}
          aria-pressed={isCover}
          className={styles.selectedPhotoCoverButton}
          data-selected={isCover ? "true" : "false"}
          disabled={busy}
          onClick={onSetCover}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          {isCover ? "★" : "☆"}
        </button>
      </div>
    </li>
  );
}

function formatActivationCodeInput(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutPrefix = cleaned.startsWith("MF") ? cleaned.slice(2) : cleaned;
  const groups = [
    withoutPrefix.slice(0, 4),
    withoutPrefix.slice(4, 8),
    withoutPrefix.slice(8, 10),
  ].filter(Boolean);
  return groups.length > 0 ? `MF-${groups.join("-")}` : "";
}

export function ImportDestination({
  files,
  onFilesChange,
}: {
  readonly files: readonly File[];
  readonly onFilesChange: (files: File[]) => void;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [albums, setAlbums] = useState<readonly DestinationAlbum[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Which step of the destination choice is showing; the forms only appear once one is picked. */
  const [mode, setMode] = useState<DestinationMode>("choose");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newStory, setNewStory] = useState("");
  const [detectedCountryCode, setDetectedCountryCode] = useState<
    string | null
  >(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const nameEditedRef = useRef(false);
  const [licenseBlock, setLicenseBlock] = useState<{
    readonly code: TripLicenseErrorCode;
    readonly message: string;
  } | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [activating, setActivating] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(
    null,
  );

  function removeFile(target: File) {
    onFilesChange(files.filter((file) => file !== target));
    if (coverFile === target) setCoverFile(null);
  }

  function reorderTo(dragged: File, targetKey: string) {
    if (fileKey(dragged) === targetKey) return;
    const draggedIndex = files.findIndex((file) => file === dragged);
    const targetIndex = files.findIndex(
      (file) => fileKey(file) === targetKey,
    );
    if (
      draggedIndex === -1 ||
      targetIndex === -1 ||
      draggedIndex === targetIndex
    ) {
      return;
    }
    const next = [...files];
    const [moved] = next.splice(draggedIndex, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    onFilesChange(next);
  }

  function onAddMoreFiles(event: ChangeEvent<HTMLInputElement>) {
    const added = [...(event.target.files ?? [])];
    event.target.value = "";
    if (added.length === 0) return;
    onFilesChange([...files, ...added]);
  }

  useEffect(() => {
    let alive = true;

    async function detectLocation() {
      setDetectingLocation(true);
      try {
        for (const file of files.slice(0, MAX_FILES_TO_SCAN_FOR_GPS)) {
          if (!alive) return;
          const fields = await parseBrowserExifFields(file).catch(() => null);
          const latitude =
            typeof fields?.latitude === "number" ? fields.latitude : null;
          const longitude =
            typeof fields?.longitude === "number" ? fields.longitude : null;
          if (latitude === null || longitude === null) continue;

          const response = await fetch("/api/geocode/reverse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lookups: [
                { id: "detected", latitude, longitude, name: "Novo álbum" },
              ],
            }),
          }).catch(() => null);
          const body = (await response?.json().catch(() => null)) as {
            readonly labels?: Record<string, string>;
          } | null;
          const label = body?.labels?.detected;
          if (!alive || !label) return;

          if (!nameEditedRef.current) {
            setNewName(label);
          }
          setDetectedCountryCode(countryCodeFromPlaceLabel(label));
          return;
        }
      } finally {
        if (alive) setDetectingLocation(false);
      }
    }

    void detectLocation();
    return () => {
      alive = false;
    };
  }, [files]);

  useEffect(() => {
    let alive = true;
    void fetch("/api/me/albums")
      .then(async (response) => {
        const payload = (await response.json()) as {
          readonly albums?: DestinationAlbum[];
          readonly error?: string;
        };
        if (!alive) return;
        if (!response.ok) {
          setLoadError(payload.error ?? "Não foi possível listar os álbuns.");
          setAlbums([]);
          return;
        }
        setAlbums(payload.albums ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setLoadError("Não foi possível listar os álbuns.");
        setAlbums([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function addToAlbum(album: DestinationAlbum) {
    setBusy(true);
    setError(null);
    try {
      const result = await uploadFilesToAlbum({
        experienceId: album.experienceId,
        albumId: album.albumId,
        files,
        onProgress: setProgress,
      });
      if (result.cloudWarning) {
        setError(
          `Fotos guardadas neste aparelho, mas o envio à nuvem falhou: ${result.cloudWarning}`,
        );
        return;
      }
      router.replace(
        profileTripAlbumPath(album.experienceSlug, album.albumId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar fotos.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function createNewAlbum() {
    const name = newName.trim();
    if (!name) {
      setError("Escolha um nome para o álbum.");
      return;
    }
    if (authLoading) {
      setError("Aguarde a verificação da sessão.");
      return;
    }
    if (!user) {
      setError("Entre na sua conta para criar o álbum.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const chosenCover =
        coverFile && files.includes(coverFile) ? coverFile : null;
      const orderedFiles = chosenCover
        ? [chosenCover, ...files.filter((file) => file !== chosenCover)]
        : files;
      const result = await createNamedTripFromFiles({
        files: orderedFiles,
        name,
        story: newStory,
        ownerId: user.id,
        onProgress: setProgress,
      });
      if (result.cloudWarning) {
        setError(
          `Álbum criado, mas o envio à nuvem falhou: ${result.cloudWarning}`,
        );
        return;
      }
      router.replace(profileTripAlbumPath(result.slug, result.albumId));
    } catch (err) {
      if (err instanceof TripLicenseError) {
        setLicenseBlock({ code: err.code, message: err.message });
        return;
      }
      setError(err instanceof Error ? err.message : "Falha ao criar o álbum.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function activateInlineCode() {
    const trimmed = activationCode.trim().toUpperCase();
    if (!/^MF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(trimmed)) {
      setActivationMessage("Digite o código no formato MF-XXXX-XXXX-XX.");
      return;
    }
    setActivating(true);
    setActivationMessage(null);
    try {
      const response = await fetch("/api/activation/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        readonly error?: string;
      };
      if (!response.ok) {
        setActivationMessage(data.error ?? "Não foi possível ativar a key.");
        return;
      }
      setActivationCode("");
      setLicenseBlock(null);
      await createNewAlbum();
    } finally {
      setActivating(false);
    }
  }

  const count = files.length;

  return (
    <section className={styles.destination}>
      <p className="eyebrow">Adicionar fotos</p>
      <h1>
        {count} foto{count === 1 ? "" : "s"} escolhida{count === 1 ? "" : "s"}
      </h1>
      <p className={styles.lead}>
        Crie um álbum novo ou escolha um que você já tem.
      </p>

      <section aria-label="Fotos selecionadas" className={styles.selectedPhotosSection}>
        <ul className={styles.selectedPhotosGrid}>
          {files.map((file, index) => (
            <SelectedPhotoItem
              busy={busy}
              file={file}
              isCover={coverFile ? coverFile === file : index === 0}
              key={fileKey(file)}
              onDragOverKey={(targetKey) => reorderTo(file, targetKey)}
              onRemove={() => removeFile(file)}
              onSetCover={() => setCoverFile(file)}
            />
          ))}
          <li className={styles.selectedPhotoItem}>
            <label className={styles.selectedPhotoAddMore}>
              <span aria-hidden="true">+</span>
              Adicionar
              <input
                accept={IMPORT_FILE_ACCEPT}
                className={styles.hiddenInput}
                disabled={busy}
                multiple
                onChange={onAddMoreFiles}
                type="file"
              />
            </label>
          </li>
        </ul>
        {files.length === 0 ? (
          <p className={styles.lead}>
            Nenhuma foto selecionada. Adicione fotos para continuar.
          </p>
        ) : null}
      </section>

      {mode === "choose" ? (
        <div className={styles.destinationChoices}>
          <button
            className={styles.destinationChoice}
            disabled={busy}
            onClick={() => setMode("new")}
            type="button"
          >
            <strong>Criar um álbum novo de viagem</strong>
            <span>Dê um nome e conte a história dessa viagem.</span>
          </button>
          <button
            className={styles.destinationChoice}
            disabled={busy || (albums !== null && albums.length === 0)}
            onClick={() => setMode("existing")}
            type="button"
          >
            <strong>Adicionar a um álbum existente</strong>
            <span>
              {albums === null
                ? "Carregando seus álbuns…"
                : albums.length === 0
                  ? "Você ainda não tem álbuns."
                  : `Você tem ${albums.length} álbum${albums.length === 1 ? "" : "s"}.`}
            </span>
          </button>
        </div>
      ) : (
        <button
          className="link-button"
          disabled={busy}
          onClick={() => {
            setMode("choose");
            setError(null);
          }}
          type="button"
        >
          ← Voltar
        </button>
      )}

      {mode === "new" ? (
        licenseBlock ? (
          <div className={styles.destinationNew}>
            <p className={styles.destinationLabel}>
              {licenseBlock.code === "trip_limit_reached"
                ? "Limite de viagens atingido"
                : "Você precisa ativar uma key"}
            </p>
            <p className={styles.lead}>{licenseBlock.message}</p>
            <label htmlFor="inline-activation-code">Código de ativação</label>
            <input
              disabled={activating}
              id="inline-activation-code"
              onChange={(event) =>
                setActivationCode(formatActivationCodeInput(event.target.value))
              }
              placeholder="MF-____-____-__"
              value={activationCode}
            />
            <button
              className="button primary"
              disabled={activating || !activationCode.trim()}
              onClick={() => void activateInlineCode()}
              type="button"
            >
              {activating ? "Ativando…" : "Ativar"}
            </button>
            {activationMessage ? (
              <p className={styles.error} role="alert">
                {activationMessage}
              </p>
            ) : null}
          </div>
        ) : (
          <div className={styles.destinationNew}>
            <p className={styles.destinationLabel}>Criar novo álbum de viagem</p>
            <label htmlFor="new-album-name">Nome do álbum</label>
            <div className={styles.destinationNameField}>
              {detectedCountryCode ? (
                // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
                <img
                  alt=""
                  className={styles.destinationNameFlag}
                  decoding="async"
                  height={15}
                  src={`https://flagcdn.com/w40/${detectedCountryCode.toLowerCase()}.png`}
                  width={20}
                />
              ) : null}
              <input
                className={
                  detectedCountryCode ? styles.destinationNameInputWithFlag : ""
                }
                disabled={busy}
                id="new-album-name"
                onChange={(event) => {
                  nameEditedRef.current = true;
                  setNewName(event.target.value);
                }}
                placeholder="Jamaica, Paris…"
                value={newName}
              />
            </div>
            {detectingLocation ? (
              <small className={styles.destinationHint}>
                Detectando o local da viagem…
              </small>
            ) : null}
            <label htmlFor="new-album-story">Sobre essa viagem</label>
            <textarea
              disabled={busy}
              id="new-album-story"
              maxLength={4000}
              onChange={(event) => setNewStory(event.target.value)}
              placeholder="O que essa viagem significou para você?"
              rows={5}
              value={newStory}
            />
            <button
              className="button primary"
              disabled={busy || !newName.trim() || files.length === 0}
              onClick={() => void createNewAlbum()}
              type="button"
            >
              Criar álbum
            </button>
          </div>
        )
      ) : null}

      {mode === "existing" ? (
        <>
          <p className={styles.destinationLabel}>Escolher um álbum</p>
          {albums === null ? (
            <p className={styles.lead}>Carregando seus álbuns…</p>
          ) : albums.length === 0 ? (
            <p className={styles.lead}>Você ainda não tem álbuns.</p>
          ) : (
            <ul className={styles.destinationList}>
              {albums.map((album) => (
                <li key={album.albumId}>
                  <button
                    className={styles.destinationAlbum}
                    disabled={busy || files.length === 0}
                    onClick={() => void addToAlbum(album)}
                    type="button"
                  >
                    <ExperienceCoverThumb
                      className={styles.destinationCover}
                      coverPhotoId={album.coverPhotoId}
                      fallbackClassName={styles.destinationCoverFallback}
                      imageClassName={styles.destinationCoverImage}
                      title={album.title}
                      variant="thumbnail"
                    />
                    <span className={styles.destinationAlbumCopy}>
                      <strong>
                        {album.countryCode ? (
                          // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
                          <img
                            alt=""
                            className={styles.destinationFlag}
                            decoding="async"
                            height={15}
                            src={`https://flagcdn.com/w40/${album.countryCode.toLowerCase()}.png`}
                            width={20}
                          />
                        ) : null}
                        {album.title}
                      </strong>
                      <span>
                        {album.photoCount} foto
                        {album.photoCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {progress ? <p className={styles.lead}>{progress}</p> : null}
      {error || loadError ? (
        <p className={styles.error} role="alert">
          {error ?? loadError}
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { Capacitor } from "@capacitor/core";
import {
  isNativePhotoPickerAvailable,
  MomentsPhotoLibrary,
} from "@moments-forever/capacitor-photo-library";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { useLockPageScroll } from "@/components/use-lock-page-scroll";
import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import { COVER_ASPECT_HEIGHT, COVER_ASPECT_WIDTH, panCrop, zoomCrop, type CropFrame } from "@/lib/experiences/cover-crop";
import {
  CENTER_FOCUS,
  MAX_COVER_ZOOM,
  MIN_COVER_ZOOM,
  coverImageStyle,
  isCenterFocus,
  type CoverFocus,
} from "@/lib/experiences/cover-focus";
import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";
import { createLibraryClient } from "@/lib/photo-library/library-client";
import type { NativeOrigins } from "@/lib/photo-library/native-origin";
import { uploadFilesToAlbum } from "@/lib/photos/upload-files-to-album";

import styles from "./cover-editor.module.css";

type Step = "choose" | "album" | "crop";

/** What gets framed: a photo already in the album, or one just picked on the phone (not uploaded yet). */
type Source =
  | { readonly kind: "album"; readonly photoId: string }
  | { readonly kind: "phone"; readonly file: File; readonly origins?: NativeOrigins };

/**
 * Cover editor. Pick a photo (from the trip's album or from the phone), then
 * drag / pinch it inside ONE preview that has the real shape of the cover card
 * and is drawn with the same style function as the cards. Nothing is saved
 * until "Salvar".
 */
export function CoverEditor({
  albumId,
  experienceId,
  title,
  photoIds,
  coverPhotoId,
  coverFocus,
  onClose,
  onSaved,
}: {
  readonly albumId: string;
  readonly experienceId: string;
  readonly title: string;
  /** Photos that already belong to this trip's album. */
  readonly photoIds: readonly string[];
  readonly coverPhotoId: string | null;
  readonly coverFocus: CoverFocus | null;
  readonly onClose: () => void;
  /** Called after the cover was saved on the server. */
  readonly onSaved: (cover: { readonly photoId: string; readonly focus: CoverFocus | null }) => void;
}) {
  useLockPageScroll();
  const [step, setStep] = useState<Step>("choose");
  const [source, setSource] = useState<Source | null>(null);
  const [crop, setCrop] = useState<CoverFocus>(CENTER_FOCUS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const client = useMemo(
    () =>
      createLibraryClient({
        plugin: MomentsPhotoLibrary,
        platform: Capacitor.getPlatform() === "android" ? "android" : "ios",
      }),
    [],
  );

  function startCrop(next: Source) {
    setSource(next);
    setUploadedId(null);
    setMessage(null);
    // Re-choosing the current cover keeps its saved framing; any other photo starts centred.
    setCrop(next.kind === "album" && next.photoId === coverPhotoId && coverFocus ? coverFocus : CENTER_FOCUS);
    setStep("crop");
  }

  async function pickFromPhone() {
    setMessage(null);
    if (!isNativePhotoPickerAvailable()) {
      // Browser / PWA / older app build: the plain photo input, same as the other pickers.
      inputRef.current?.click();
      return;
    }
    try {
      const outcome = await client.pickPhotos();
      const file = outcome.files[0];
      if (outcome.cancelled) return;
      if (!file) {
        setMessage("Não foi possível abrir essa foto. Tente outra.");
        return;
      }
      startCrop({ kind: "phone", file, origins: outcome.origins });
    } catch {
      setMessage("Não foi possível abrir as fotos do telefone.");
    }
  }

  async function save() {
    if (!source || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      let photoId: string;
      if (source.kind === "album") {
        photoId = source.photoId;
      } else if (uploadedId) {
        photoId = uploadedId;
      } else {
        // A phone photo becomes a photo of this album first (the cover is always an album photo).
        const result = await uploadFilesToAlbum({
          experienceId,
          albumId,
          files: [source.file],
          origins: source.origins,
          onProgress: setMessage,
        });
        const id = result.photoIds[0];
        if (!id) throw new Error("Não foi possível enviar a foto.");
        setUploadedId(id);
        if (result.cloudWarning) {
          setMessage(`A foto ficou só neste aparelho: o envio à nuvem falhou. ${result.cloudWarning} Toque em Salvar para tentar de novo.`);
          setBusy(false);
          return;
        }
        photoId = id;
      }
      const focus = isCenterFocus(crop) ? null : crop;
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cover_photo_id: photoId, cover_focus: focus }),
      });
      const payload = (await response.json().catch(() => ({}))) as { readonly error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar a capa.");
      onSaved({ photoId, focus });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a capa.");
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div aria-label="Editar capa" aria-modal="true" className={styles.overlay} role="dialog">
      <input
        accept="image/*"
        className={styles.hiddenInput}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) startCrop({ kind: "phone", file });
        }}
        ref={inputRef}
        type="file"
      />
      <header className={styles.header}>
        {step === "crop" ? (
          <button className={styles.headerButton} disabled={busy} onClick={() => setStep("choose")} type="button">
            ‹ Trocar foto
          </button>
        ) : step === "album" ? (
          <button className={styles.headerButton} onClick={() => setStep("choose")} type="button">
            ‹ Voltar
          </button>
        ) : (
          <span />
        )}
        <h2 className={styles.title}>Editar capa</h2>
        <span />
      </header>

      {step === "choose" ? (
        <div className={styles.body}>
          <p className={styles.lead}>De onde vem a foto da capa de {title}?</p>
          <div className={styles.options}>
            <button
              className={styles.option}
              disabled={photoIds.length === 0}
              onClick={() => setStep("album")}
              type="button"
            >
              <strong>Escolher do álbum</strong>
              <span>
                {photoIds.length === 0
                  ? "Este álbum ainda não tem fotos."
                  : "Fotos que já estão nesta viagem."}
              </span>
            </button>
            <button className={styles.option} onClick={() => void pickFromPhone()} type="button">
              <strong>Escolher do telefone</strong>
              <span>Abre a sua galeria de fotos.</span>
            </button>
          </div>
          {message ? (
            <p className={styles.message} role="alert">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === "album" ? (
        <div className={styles.body}>
          <p className={styles.lead}>Toque na foto que será a capa.</p>
          <div className={styles.grid}>
            {photoIds.map((id) => (
              <button
                aria-label="Usar esta foto como capa"
                className={styles.gridItem}
                data-current={id === coverPhotoId ? "true" : "false"}
                key={id}
                onClick={() => startCrop({ kind: "album", photoId: id })}
                type="button"
              >
                <ExperienceCoverThumb
                  className={styles.gridThumb}
                  coverPhotoId={id}
                  fallbackClassName={styles.gridThumb}
                  imageClassName={styles.gridImage}
                  title={title}
                  variant="thumbnail"
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === "crop" && source ? (
        <>
          <div className={styles.cropBody}>
            <CropStage crop={crop} onCrop={setCrop} source={source} />
            <p className={styles.hint}>Arraste para posicionar. Use dois dedos (ou o controle abaixo) para o zoom.</p>
          </div>
          {message ? (
            <p className={styles.message} role="alert">
              {message}
            </p>
          ) : null}
        </>
      ) : null}

      {step === "crop" ? (
        <footer className={styles.footer}>
          <button className="button secondary" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button primary" disabled={busy} onClick={() => void save()} type="button">
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      ) : (
        <footer className={styles.footer}>
          <button className="button secondary" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
        </footer>
      )}
    </div>,
    document.body,
  );
}

function useSourceUrl(source: Source): string | null {
  const albumSrc = useLocalPhotoObjectUrl(source.kind === "album" ? source.photoId : null, "full");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const file = source.kind === "phone" ? source.file : null;
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the object URL only exists after mount
    setFileUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return source.kind === "album" ? albumSrc : fileUrl;
}

/**
 * The one preview: a frame with the cover's real shape (4:5, as on the iPhone
 * trip cards) showing the photo with the SAME style the cards use.
 */
function CropStage({
  source,
  crop,
  onCrop,
}: {
  readonly source: Source;
  readonly crop: CoverFocus;
  readonly onCrop: (crop: CoverFocus) => void;
}) {
  const src = useSourceUrl(source);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const cropRef = useRef(crop);
  const naturalRef = useRef(natural);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    base: CoverFocus;
    startX: number;
    startY: number;
    startDistance: number;
    startZoom: number;
  } | null>(null);

  useEffect(() => {
    cropRef.current = crop;
    naturalRef.current = natural;
  });

  function frameGeometry(): { frame: CropFrame; left: number; top: number } | null {
    const rect = frameRef.current?.getBoundingClientRect();
    const size = naturalRef.current;
    if (!rect || !size || rect.width === 0) return null;
    return {
      frame: { frameW: rect.width, frameH: rect.height, imageW: size.w, imageH: size.h },
      left: rect.left,
      top: rect.top,
    };
  }

  function centre(): { x: number; y: number; distance: number } {
    const points = [...pointers.current.values()];
    const a = points[0]!;
    const b = points[1];
    if (!b) return { x: a.x, y: a.y, distance: 0 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function beginGesture() {
    const c = centre();
    gesture.current = {
      base: cropRef.current,
      startX: c.x,
      startY: c.y,
      startDistance: c.distance,
      startZoom: cropRef.current.zoom ?? MIN_COVER_ZOOM,
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    beginGesture();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const geometry = frameGeometry();
    const start = gesture.current;
    if (!geometry || !start) return;
    const c = centre();
    let next = start.base;
    if (pointers.current.size >= 2 && start.startDistance > 0) {
      // Pinch: zoom around where the fingers started, then follow the fingers' centre.
      next = zoomCrop(
        geometry.frame,
        start.base,
        start.startZoom * (c.distance / start.startDistance),
        start.startX - geometry.left,
        start.startY - geometry.top,
      );
    }
    onCrop(panCrop(geometry.frame, next, c.x - start.startX, c.y - start.startY));
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0) beginGesture();
    else gesture.current = null;
  }

  // Desktop: mouse wheel / trackpad pinch zooms around the pointer. Native listener: it must not be passive.
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    function onWheel(event: WheelEvent) {
      const geometry = frameGeometry();
      if (!geometry) return;
      event.preventDefault();
      const zoom = (cropRef.current.zoom ?? MIN_COVER_ZOOM) * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      onCrop(zoomCrop(geometry.frame, cropRef.current, zoom, event.clientX - geometry.left, event.clientY - geometry.top));
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frameGeometry/onCrop only read refs and the stable setter
  }, []);

  function onSlider(value: number) {
    const geometry = frameGeometry();
    if (!geometry) return;
    onCrop(zoomCrop(geometry.frame, cropRef.current, value, geometry.frame.frameW / 2, geometry.frame.frameH / 2));
  }

  return (
    <div className={styles.stage}>
      <div
        className={styles.frame}
        data-testid="cover-crop-frame"
        onPointerCancel={endPointer}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        ref={frameRef}
        style={{ aspectRatio: `${COVER_ASPECT_WIDTH} / ${COVER_ASPECT_HEIGHT}` }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className={styles.frameImage}
            draggable={false}
            onLoad={(event) =>
              setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })
            }
            src={src}
            style={coverImageStyle(crop)}
          />
        ) : (
          <span className={styles.framePending}>Carregando…</span>
        )}
      </div>
      <label className={styles.zoomRow}>
        <span aria-hidden="true">−</span>
        <input
          aria-label="Zoom da capa"
          max={MAX_COVER_ZOOM}
          min={MIN_COVER_ZOOM}
          onChange={(event) => onSlider(Number(event.target.value))}
          step={0.01}
          type="range"
          value={crop.zoom ?? MIN_COVER_ZOOM}
        />
        <span aria-hidden="true">+</span>
      </label>
    </div>
  );
}

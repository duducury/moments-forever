"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Capacitor } from "@capacitor/core";
import {
  isNativePhotoPickerAvailable,
  isPhotoLibraryAvailable,
  MomentsPhotoLibrary,
} from "@moments-forever/capacitor-photo-library";

import { PageScrollLock } from "@/components/use-lock-page-scroll";
import { createLibraryClient } from "@/lib/photo-library/library-client";
import type { NativeOrigins } from "@/lib/photo-library/native-origin";

import styles from "./add-photos-menu.module.css";

/**
 * The app's own "Adicionar fotos" menu: Escolher fotos, Tirar uma foto and —
 * only in the native app, where the library plugin exists — ✨ Encontrar viagem
 * / Encontrar fotos.
 *
 * - "Escolher fotos" opens the iPhone photo picker DIRECTLY (plugin `pickPhotos`).
 *   It must never go through <input type="file">: iOS answers that with its own
 *   "Photo Library / Take Photo / Choose Files" sheet, which is the old menu.
 * - "Tirar uma foto" opens the camera directly (<input capture>).
 * - There is no "Escolher arquivos" here.
 *
 * Where the plugin is missing (browser, PWA, an older App Store build) the menu
 * is skipped and the trigger opens the plain photo input, as before.
 */
export function useNativeLibraryAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    // Known only after mount: the server render cannot tell it is inside the app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvailable(isPhotoLibraryAvailable());
  }, []);
  return available;
}

type PickState = "idle" | "preparing" | "failed";

export function useAddPhotosMenu({
  findLabel,
  libraryAccept = "image/*",
  onFiles,
  onFind,
}: {
  /** "Encontrar viagem" outside a trip, "Encontrar fotos" inside one. */
  readonly findLabel: "Encontrar viagem" | "Encontrar fotos";
  /** What the plain photo input accepts where there is no native picker (browser/PWA). */
  readonly libraryAccept?: string;
  /** `origins` is set only by the native picker: which library photo each file is. */
  readonly onFiles: (files: File[], origins?: NativeOrigins) => void;
  readonly onFind: () => void;
}): {
  /** Call from the trigger's onClick: opens the menu, or the picker where there is no plugin. */
  readonly openMenu: () => void;
  /** Render once, next to the trigger. */
  readonly menu: ReactNode;
} {
  const nativeAvailable = useNativeLibraryAvailable();
  const [open, setOpen] = useState(false);
  const libraryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [pickState, setPickState] = useState<PickState>("idle");
  const titleId = useId();
  const client = useMemo(
    () =>
      createLibraryClient({
        plugin: MomentsPhotoLibrary,
        platform: Capacitor.getPlatform() === "android" ? "android" : "ios",
      }),
    [],
  );

  function handleInput(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = "";
    if (files.length > 0) onFiles(files);
  }

  function pick(ref: { current: HTMLInputElement | null }) {
    // Same tap: iOS only opens a picker from a user gesture.
    ref.current?.click();
    setOpen(false);
  }

  async function pickFromLibrary() {
    setOpen(false);
    if (!isNativePhotoPickerAvailable()) {
      // Older app build without the picker: the plain photo input, as before.
      libraryRef.current?.click();
      return;
    }
    try {
      // Nothing is shown while the picker is open; "preparing" starts only once photos were chosen.
      const outcome = await client.pickPhotos({ onSelected: () => setPickState("preparing") });
      if (outcome.cancelled) {
        setPickState("idle");
        return;
      }
      if (outcome.files.length === 0) {
        setPickState("failed");
        return;
      }
      setPickState("idle");
      onFiles([...outcome.files], outcome.origins);
    } catch {
      setPickState("failed");
    }
  }

  const openMenu = () => {
    if (nativeAvailable) setOpen(true);
    else libraryRef.current?.click();
  };

  const menu = (
    <>
      <input
        accept={libraryAccept}
        className={styles.hidden}
        multiple
        onChange={(event) => handleInput(event.currentTarget)}
        ref={libraryRef}
        type="file"
      />
      <input
        accept="image/*"
        capture="environment"
        className={styles.hidden}
        onChange={(event) => handleInput(event.currentTarget)}
        ref={cameraRef}
        type="file"
      />

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.backdrop}
              onClick={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
              role="presentation"
            >
              <PageScrollLock />
              <div
                aria-labelledby={titleId}
                aria-modal="true"
                className={styles.sheet}
                role="dialog"
              >
                <p className={styles.title} id={titleId}>
                  Adicionar fotos
                </p>

                <div className={styles.actions}>
                  <button className={styles.action} onClick={() => void pickFromLibrary()} type="button">
                    <span aria-hidden className={styles.icon}><GalleryIcon /></span>
                    <span className={styles.copy}>
                      <span className={styles.copyTitle}>Escolher fotos</span>
                      <span className={styles.copyHint}>Selecione fotos da sua galeria</span>
                    </span>
                  </button>
                  <button className={styles.action} onClick={() => pick(cameraRef)} type="button">
                    <span aria-hidden className={styles.icon}><CameraIcon /></span>
                    <span className={styles.copy}>
                      <span className={styles.copyTitle}>Tirar uma foto</span>
                      <span className={styles.copyHint}>Use a câmera</span>
                    </span>
                  </button>
                  <button
                    className={styles.action}
                    onClick={() => {
                      setOpen(false);
                      onFind();
                    }}
                    type="button"
                  >
                    <span aria-hidden className={styles.icon}><SparkleIcon /></span>
                    <span className={styles.copy}>
                      <span className={styles.copyTitle}>
                        {findLabel === "Encontrar viagem" ? "Encontrar uma viagem" : "Encontrar fotos"}
                      </span>
                      <span className={styles.copyHint}>
                        {findLabel === "Encontrar viagem"
                          ? "Deixe o Moments Forever procurar viagens nas suas fotos"
                          : "Procure, nas suas fotos, o que ainda não está nesta viagem"}
                      </span>
                    </span>
                  </button>
                </div>

                <button className={styles.cancel} onClick={() => setOpen(false)} type="button">
                  Cancelar
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {pickState !== "idle" && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.backdrop} role="presentation">
              <div aria-live="polite" className={styles.busy} role="status">
                {pickState === "preparing" ? (
                  <>
                    <span aria-hidden className={styles.spinner} />
                    <span>Preparando fotos…</span>
                  </>
                ) : (
                  <>
                    <span>Não foi possível preparar as fotos. Tente novamente.</span>
                    <button
                      className={styles.busyClose}
                      onClick={() => setPickState("idle")}
                      type="button"
                    >
                      Fechar
                    </button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );

  return { openMenu, menu };
}

function GalleryIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect height="16" rx="3" width="18" x="3" y="4" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.2" r="3.3" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24">
      <path d="M11 2.5c.4 3.9 1.7 5.2 5.6 5.6-3.9.4-5.2 1.7-5.6 5.6-.4-3.9-1.7-5.2-5.6-5.6 3.9-.4 5.2-1.7 5.6-5.6Z" />
      <path d="M18.5 13c.3 2.4 1.1 3.2 3.5 3.5-2.4.3-3.2 1.1-3.5 3.5-.3-2.4-1.1-3.2-3.5-3.5 2.4-.3 3.2-1.1 3.5-3.5Z" />
    </svg>
  );
}

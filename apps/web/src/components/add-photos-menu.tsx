"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { isPhotoLibraryAvailable } from "@moments-forever/capacitor-photo-library";

import { IMPORT_FILE_ACCEPT } from "@/lib/photo-import/pending-import-files";

import styles from "./add-photos-menu.module.css";

/**
 * The app's own "Adicionar fotos" menu: Fototeca, Tirar foto, Escolher arquivos
 * and — only in the native app, where the library plugin exists — ✨ Encontrar
 * viagem / Encontrar fotos. iOS's system sheet for <input type="file"> cannot
 * take a fourth entry, hence this menu.
 *
 * Where the plugin is missing (browser, PWA, an older App Store build) the menu
 * is skipped and the trigger opens the file picker directly, as before.
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

export function useAddPhotosMenu({
  findLabel,
  libraryAccept = "image/*",
  onFiles,
  onFind,
}: {
  /** "Encontrar viagem" outside a trip, "Encontrar fotos" inside one. */
  readonly findLabel: "Encontrar viagem" | "Encontrar fotos";
  /** What the plain "Fototeca" picker accepts (each caller keeps its current value). */
  readonly libraryAccept?: string;
  readonly onFiles: (files: File[]) => void;
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
  const filesRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();

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
      <input
        accept={IMPORT_FILE_ACCEPT}
        className={styles.hidden}
        multiple
        onChange={(event) => handleInput(event.currentTarget)}
        ref={filesRef}
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
                  <button className={styles.action} onClick={() => pick(libraryRef)} type="button">
                    <span aria-hidden className={styles.icon}><GalleryIcon /></span>
                    <span className={styles.copy}>
                      <span className={styles.copyTitle}>Fototeca</span>
                      <span className={styles.copyHint}>Selecione fotos da sua galeria</span>
                    </span>
                  </button>
                  <button className={styles.action} onClick={() => pick(cameraRef)} type="button">
                    <span aria-hidden className={styles.icon}><CameraIcon /></span>
                    <span className={styles.copy}>
                      <span className={styles.copyTitle}>Tirar foto</span>
                      <span className={styles.copyHint}>Use a câmera</span>
                    </span>
                  </button>
                  <button className={styles.action} onClick={() => pick(filesRef)} type="button">
                    <span aria-hidden className={styles.icon}><FolderIcon /></span>
                    <span className={styles.copy}>
                      <span className={styles.copyTitle}>Escolher arquivos</span>
                      <span className={styles.copyHint}>Fotos e arquivos do dispositivo</span>
                    </span>
                  </button>
                </div>

                <button
                  className={styles.find}
                  onClick={() => {
                    setOpen(false);
                    onFind();
                  }}
                  type="button"
                >
                  <span aria-hidden className={styles.findIcon}><SparkleIcon /></span>
                  <span>
                    <span className={styles.findTitle}>
                      {findLabel === "Encontrar viagem" ? "Encontrar uma viagem" : "Encontrar fotos"}
                    </span>
                    <span className={styles.findHint}>
                      {findLabel === "Encontrar viagem"
                        ? "Deixe o Moments Forever procurar viagens nas suas fotos"
                        : "Deixe o Moments Forever procurar, nas suas fotos, o que ainda não está nesta viagem"}
                    </span>
                  </span>
                </button>

                <button className={styles.cancel} onClick={() => setOpen(false)} type="button">
                  Cancelar
                </button>
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

function FolderIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.4h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
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

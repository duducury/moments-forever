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
                <button className={styles.option} onClick={() => pick(libraryRef)} type="button">
                  <span aria-hidden className={styles.optionIcon}>📷</span>
                  Fototeca
                </button>
                <button className={styles.option} onClick={() => pick(cameraRef)} type="button">
                  <span aria-hidden className={styles.optionIcon}>📸</span>
                  Tirar foto
                </button>
                <button className={styles.option} onClick={() => pick(filesRef)} type="button">
                  <span aria-hidden className={styles.optionIcon}>📁</span>
                  Escolher arquivos
                </button>
                <button
                  className={styles.option}
                  onClick={() => {
                    setOpen(false);
                    onFind();
                  }}
                  type="button"
                >
                  <span aria-hidden className={styles.optionIcon}>✨</span>
                  <span>
                    {findLabel}
                    <span className={styles.optionHint}>
                      {findLabel === "Encontrar viagem"
                        ? "Procura viagens nas fotos deste aparelho"
                        : "Procura, nas suas fotos, o que ainda não está aqui"}
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

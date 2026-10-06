"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import {
  IMPORT_FILE_ACCEPT,
  setPendingImportFiles,
} from "@/lib/photo-import/pending-import-files";

import { useAddPhotosMenu } from "./add-photos-menu";
import { FindTripsFlow } from "./find-trips/find-trips-flow";

/**
 * Opens the app's "Adicionar fotos" menu (Escolher fotos, Tirar uma foto,
 * ✨ Encontrar viagem) and only then goes to /import with the chosen
 * files. Without the native photo plugin (browser, older app) it opens the
 * device photo picker directly, as it always did.
 */
export function NewTripButton({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const [finding, setFinding] = useState(false);
  const { openMenu, menu } = useAddPhotosMenu({
    findLabel: "Encontrar viagem",
    libraryAccept: IMPORT_FILE_ACCEPT,
    // /import has its own pipeline: the native picker's `origins` are not used here.
    onFiles: (files) => {
      setPendingImportFiles(files);
      router.push("/import");
    },
    onFind: () => setFinding(true),
  });

  return (
    <>
      <button className={className} onClick={openMenu} type="button">
        {children}
      </button>
      {menu}
      {finding ? (
        <FindTripsFlow
          onClose={() => setFinding(false)}
          target={{ mode: "discover" }}
        />
      ) : null}
    </>
  );
}

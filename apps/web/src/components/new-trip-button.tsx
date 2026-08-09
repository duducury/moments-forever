"use client";

import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";

import {
  IMPORT_FILE_ACCEPT,
  setPendingImportFiles,
} from "@/lib/photo-import/pending-import-files";

/**
 * Opens the device photo picker first; only then goes to /import with those files.
 */
export function NewTripButton({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <button
        className={className}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {children}
      </button>
      <input
        accept={IMPORT_FILE_ACCEPT}
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length === 0) return;
          setPendingImportFiles(files);
          router.push("/import");
        }}
        ref={inputRef}
        style={{ display: "none" }}
        type="file"
      />
    </>
  );
}

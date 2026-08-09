/**
 * Files chosen before navigating to /import (e.g. "Nova viagem" on profile).
 * In-memory only — cleared after the import page boots (or on reload).
 */

let pendingFiles: File[] | null = null;
/** Survives React Strict Mode double-invoking useState initializers. */
let bootSnapshot: File[] | null | undefined;

export const IMPORT_FILE_ACCEPT =
  "image/*,.heic,.heif,.dng,.cr2,.cr3,.nef,.arw,.raf";

export function setPendingImportFiles(files: readonly File[]): void {
  pendingFiles = files.length > 0 ? [...files] : null;
  bootSnapshot = undefined;
}

/**
 * Idempotent read for the import page boot. Safe under Strict Mode
 * double-init; call only from a useState initializer.
 */
export function getStagedImportFilesForBoot(): File[] | null {
  if (bootSnapshot !== undefined) return bootSnapshot;
  bootSnapshot = pendingFiles;
  pendingFiles = null;
  return bootSnapshot;
}

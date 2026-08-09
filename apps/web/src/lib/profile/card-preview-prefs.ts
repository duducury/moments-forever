/**
 * Owner-chosen strip of up to 4 photos on the profile trip card.
 * Stored locally (same device as IndexedDB blobs) — no DB migration.
 */

const STORAGE_KEY = "moments-forever-card-previews-v1";

export type CardPreviewPrefs = {
  readonly previewPhotoIds: readonly string[];
};

const listeners = new Set<() => void>();

export function subscribeCardPreviewPrefs(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStoreChange);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStoreChange);
    }
  };
}

export function notifyCardPreviewPrefsChanged() {
  for (const listener of listeners) {
    listener();
  }
}

function readAll(): Record<string, CardPreviewPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CardPreviewPrefs>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getCardPreviewPrefs(
  experienceId: string,
): CardPreviewPrefs | null {
  const entry = readAll()[experienceId];
  if (!entry?.previewPhotoIds?.length) return null;
  return {
    previewPhotoIds: entry.previewPhotoIds.slice(0, 4),
  };
}

export function setCardPreviewPrefs(
  experienceId: string,
  prefs: CardPreviewPrefs,
): void {
  if (typeof window === "undefined") return;
  const all = readAll();
  all[experienceId] = {
    previewPhotoIds: prefs.previewPhotoIds.slice(0, 4),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  notifyCardPreviewPrefsChanged();
}

export function clearCardPreviewPrefs(experienceId: string): void {
  if (typeof window === "undefined") return;
  const all = readAll();
  delete all[experienceId];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  notifyCardPreviewPrefsChanged();
}

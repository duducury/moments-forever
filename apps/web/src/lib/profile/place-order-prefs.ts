/**
 * Display order of place cards on /perfil (local preference).
 */

const STORAGE_KEY = "moments-forever-place-order-v1";

const listeners = new Set<() => void>();

export function subscribePlaceOrderPrefs(onStoreChange: () => void) {
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

function notifyPlaceOrderPrefsChanged() {
  for (const listener of listeners) {
    listener();
  }
}

export function getPlaceOrderPrefs(): readonly string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function setPlaceOrderPrefs(albumIds: readonly string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...albumIds]));
  notifyPlaceOrderPrefsChanged();
}

export function applyPlaceOrder<T extends { readonly albumId: string }>(
  places: readonly T[],
  orderIds: readonly string[] = getPlaceOrderPrefs(),
): T[] {
  if (places.length === 0) return [];
  if (orderIds.length === 0) return [...places];

  const byId = new Map(places.map((place) => [place.albumId, place]));
  const ordered: T[] = [];
  for (const id of orderIds) {
    const place = byId.get(id);
    if (place) {
      ordered.push(place);
      byId.delete(id);
    }
  }
  for (const place of places) {
    if (byId.has(place.albumId)) {
      ordered.push(place);
    }
  }
  return ordered;
}

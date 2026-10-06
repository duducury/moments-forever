/**
 * What the person has ticked, and the numbers shown in the review screen.
 * Pure state helpers: nothing here imports, uploads or creates anything.
 */

import type { TitleState } from "./trip-naming";
import type { ExistingTrip, LibraryAsset } from "./types";

/** One row of the flow: a trip found in the library, or an existing trip getting more photos. */
export interface Candidate {
  /** DiscoveredTrip.id, or the existing album id. */
  readonly key: string;
  /** "new" creates a trip on confirm; "existing" adds to `target`. */
  readonly kind: "new" | "existing";
  /**
   * What the list shows: the place(s) — "New York → Boston" — or the existing
   * trip's own title. Empty while the place is still being looked up.
   */
  readonly title: string;
  /** Name a NEW trip gets if confirmed (editable): "País, Local". The target's title otherwise. */
  readonly name: string;
  /** "pending" while the place is looked up, "possible" when there is too little GPS to say where. */
  readonly titleState: TitleState;
  /** For a "possible trip": why there is no place ("Localização limitada" …). */
  readonly locationNote: string | null;
  readonly target: ExistingTrip | null;
  /** Photos that can be offered (already-present ones are removed). */
  readonly assets: readonly LibraryAsset[];
  /** YYYY-MM-DD, for display. */
  readonly period: { readonly start: string; readonly end: string } | null;
  readonly countryCode: string | null;
  /** How many of the candidate's photos have no GPS (placed by date). */
  readonly withoutLocationCount: number;
}

/** candidate key → ticked native ids. */
export type Selection = ReadonlyMap<string, ReadonlySet<string>>;

export function emptySelection(): Selection {
  return new Map();
}

export function toggleAsset(
  selection: Selection,
  key: string,
  nativeId: string,
): Selection {
  const next = new Map(selection);
  const ticked = new Set(selection.get(key) ?? []);
  if (ticked.has(nativeId)) ticked.delete(nativeId);
  else ticked.add(nativeId);
  next.set(key, ticked);
  return next;
}

export function selectAll(selection: Selection, candidate: Candidate): Selection {
  const next = new Map(selection);
  next.set(candidate.key, new Set(candidate.assets.map((asset) => asset.nativeId)));
  return next;
}

export function clearAll(selection: Selection, key: string): Selection {
  const next = new Map(selection);
  next.set(key, new Set());
  return next;
}

export interface ReviewRow {
  readonly key: string;
  /** What the person sees (the place / the existing trip). */
  readonly title: string;
  /** The name a new trip would get. */
  readonly name: string;
  readonly kind: "new" | "existing";
  readonly found: number;
  readonly selected: number;
}

export interface Review {
  /** Every candidate with at least one ticked photo, in list order. */
  readonly rows: readonly ReviewRow[];
  readonly tripCount: number;
  readonly photoCount: number;
  /** Why the confirm button must stay off, in words for the person. */
  readonly blocker: string | null;
}

/** How many of a candidate's offered photos are ticked (stale ticks are ignored). */
export function selectedCount(candidate: Candidate, selection: Selection): number {
  const ticked = selection.get(candidate.key);
  if (!ticked) return 0;
  return candidate.assets.reduce(
    (sum, asset) => sum + (ticked.has(asset.nativeId) ? 1 : 0),
    0,
  );
}

/**
 * The review: a trip takes part in the import only if the person ticked at
 * least one of its photos. Nothing is ever implied by default.
 */
export function reviewSelection(
  candidates: readonly Candidate[],
  selection: Selection,
): Review {
  const rows = candidates
    .map((candidate): ReviewRow => ({
      key: candidate.key,
      title: candidate.title,
      name: candidate.name.trim(),
      kind: candidate.kind,
      found: candidate.assets.length,
      selected: selectedCount(candidate, selection),
    }))
    .filter((row) => row.selected > 0);

  let blocker: string | null = null;
  if (rows.length === 0) blocker = "Selecione pelo menos uma foto.";
  else if (rows.some((row) => row.kind === "new" && row.name.length === 0)) {
    blocker = "Dê um nome a cada viagem nova.";
  }

  return {
    rows,
    tripCount: rows.length,
    photoCount: rows.reduce((sum, row) => sum + row.selected, 0),
    blocker,
  };
}

/** `count` photos spread evenly over the trip (not just the first ones) for the preview strip. */
export function pickPreview<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (items.length <= count) return [...items];
  const picks: T[] = [];
  for (let index = 0; index < count; index += 1) {
    picks.push(items[Math.floor((index * items.length) / count)] as T);
  }
  return picks;
}

/** The assets to export for one candidate, in the order they were found. */
export function selectedAssets(
  candidate: Candidate,
  selection: Selection,
): LibraryAsset[] {
  const ticked = selection.get(candidate.key);
  if (!ticked) return [];
  return candidate.assets.filter((asset) => ticked.has(asset.nativeId));
}

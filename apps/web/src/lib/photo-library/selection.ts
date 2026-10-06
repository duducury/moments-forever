/**
 * What the person has ticked, and the numbers shown in the review screen.
 * Pure state helpers: nothing here imports, uploads or creates anything.
 */

import type { ExistingTrip, LibraryAsset } from "./types";

/** One row of the flow: a trip found in the library, or an existing trip getting more photos. */
export interface Candidate {
  /** DiscoveredTrip.id, or the existing album id. */
  readonly key: string;
  /** "new" creates a trip on confirm; "existing" adds to `target`. */
  readonly kind: "new" | "existing";
  /** Name for a new trip (editable); the target's title otherwise. */
  readonly title: string;
  readonly target: ExistingTrip | null;
  /** Photos that can be offered (already-present ones are removed). */
  readonly assets: readonly LibraryAsset[];
  /** YYYY-MM-DD, for display. */
  readonly period: { readonly start: string; readonly end: string } | null;
  readonly countryCode: string | null;
  /** "Parece com <trip>" — same country, other dates. Never acted on automatically. */
  readonly hint: string | null;
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
  readonly title: string;
  readonly kind: "new" | "existing";
  readonly found: number;
  readonly selected: number;
}

export interface Review {
  readonly rows: readonly ReviewRow[];
  readonly tripCount: number;
  readonly photoCount: number;
  /** Rows to import: ticked photos > 0 (and a name, for new trips). */
  readonly importable: readonly ReviewRow[];
  /** Why the confirm button must stay off, in words for the person. */
  readonly blocker: string | null;
}

export function reviewSelection(
  candidates: readonly Candidate[],
  selection: Selection,
  /** Candidates the person picked on the trips screen; others are ignored. */
  chosenKeys: ReadonlySet<string>,
): Review {
  const rows = candidates
    .filter((candidate) => chosenKeys.has(candidate.key))
    .map((candidate): ReviewRow => {
      const offered = new Set(candidate.assets.map((asset) => asset.nativeId));
      const ticked = [...(selection.get(candidate.key) ?? [])].filter((id) =>
        offered.has(id),
      );
      return {
        key: candidate.key,
        title: candidate.title.trim(),
        kind: candidate.kind,
        found: candidate.assets.length,
        selected: ticked.length,
      };
    });

  const importable = rows.filter((row) => row.selected > 0);
  let blocker: string | null = null;
  if (chosenKeys.size === 0) blocker = "Escolha pelo menos uma viagem.";
  else if (importable.length === 0) blocker = "Selecione pelo menos uma foto.";
  else if (importable.some((row) => row.kind === "new" && row.title.length === 0)) {
    blocker = "Dê um nome a cada viagem nova.";
  }

  return {
    rows,
    tripCount: importable.length,
    photoCount: importable.reduce((sum, row) => sum + row.selected, 0),
    importable,
    blocker,
  };
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

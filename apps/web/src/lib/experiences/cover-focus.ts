import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How an album cover is framed. `x`/`y` are percentages of the photo (CSS
 * object-position, 50/50 = the default centre crop); `zoom` (1 = the plain
 * "cover" fit, absent = 1) enlarges the photo around that same point.
 * Everything that draws a cover uses `coverImageStyle`, so the editor and the
 * cards can never disagree.
 */
export interface CoverFocus {
  readonly x: number;
  readonly y: number;
  readonly zoom?: number;
}

export const CENTER_FOCUS: CoverFocus = { x: 50, y: 50 };

export const MIN_COVER_ZOOM = 1;
export const MAX_COVER_ZOOM = 4;

/** 1…4, two decimals; garbage is 1 (no zoom). */
export function clampZoom(value: unknown): number {
  if (value === null || value === undefined || value === "") return MIN_COVER_ZOOM;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return MIN_COVER_ZOOM;
  return Math.round(Math.min(MAX_COVER_ZOOM, Math.max(MIN_COVER_ZOOM, n)) * 100) / 100;
}

function clampPercent(value: unknown): number {
  if (value === null || value === undefined || value === "") return 50;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

/** Always returns a valid 0–100 focus (garbage becomes the centre); `zoom` only when above 1. */
export function clampFocus(focus: { x: unknown; y: unknown; zoom?: unknown }): CoverFocus {
  const zoom = clampZoom(focus.zoom);
  return {
    x: clampPercent(focus.x),
    y: clampPercent(focus.y),
    ...(zoom > MIN_COVER_ZOOM ? { zoom } : {}),
  };
}

/** True when nothing differs from the plain centred cover (nothing to store). */
export function isCenterFocus(focus: CoverFocus | null | undefined): boolean {
  return !focus || (focus.x === 50 && focus.y === 50 && clampZoom(focus.zoom) === MIN_COVER_ZOOM);
}

export interface CoverImageStyle {
  readonly objectPosition: string;
  readonly transform?: string;
  readonly transformOrigin?: string;
}

/**
 * The inline style that frames a cover <img> (which is `object-fit: cover`
 * inside an `overflow: hidden` box): the focus point stays where it is and the
 * photo is enlarged around it. undefined = the stylesheet's centred default.
 */
export function coverImageStyle(focus: CoverFocus | null | undefined): CoverImageStyle | undefined {
  if (!focus || isCenterFocus(focus)) return undefined;
  const f = clampFocus(focus);
  const origin = `${f.x}% ${f.y}%`;
  return {
    objectPosition: origin,
    ...(f.zoom ? { transform: `scale(${f.zoom})`, transformOrigin: origin } : {}),
  };
}

/** CSS object-position for the focus, or undefined to keep the stylesheet's default. */
export function focusObjectPosition(
  focus: CoverFocus | null | undefined,
): string | undefined {
  if (!focus || isCenterFocus(focus)) return undefined;
  const f = clampFocus(focus);
  return `${f.x}% ${f.y}%`;
}

/**
 * Cover focus for a set of albums. It is an optional extra: if the table does
 * not exist yet (migration not applied) or the query fails, every album simply
 * keeps the centred default.
 */
export async function loadCoverFocusByAlbum(
  supabase: Pick<SupabaseClient, "from">,
  albumIds: readonly string[],
): Promise<Map<string, CoverFocus>> {
  const result = new Map<string, CoverFocus>();
  if (albumIds.length === 0) return result;
  try {
    type FocusRow = { album_id: string; focus_x: unknown; focus_y: unknown; focus_zoom?: unknown };
    let found = await supabase
      .from("album_cover_focus")
      .select("album_id, focus_x, focus_y, focus_zoom")
      .in("album_id", [...albumIds]);
    if (found.error) {
      // The zoom column comes from a later migration: without it, read the position alone.
      found = (await supabase
        .from("album_cover_focus")
        .select("album_id, focus_x, focus_y")
        .in("album_id", [...albumIds])) as unknown as typeof found;
    }
    const data = found.data as FocusRow[] | null;
    if (found.error || !data) return result;
    for (const row of data) {
      result.set(row.album_id, clampFocus({ x: row.focus_x, y: row.focus_y, zoom: row.focus_zoom }));
    }
  } catch {
    // Optional data: never let it break the page.
  }
  return result;
}

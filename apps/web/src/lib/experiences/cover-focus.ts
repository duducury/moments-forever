import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where an album cover is centred, as percentages of the photo (CSS
 * object-position): 50/50 is the default centre crop.
 */
export interface CoverFocus {
  readonly x: number;
  readonly y: number;
}

export const CENTER_FOCUS: CoverFocus = { x: 50, y: 50 };

function clampPercent(value: unknown): number {
  if (value === null || value === undefined || value === "") return 50;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

/** Always returns a valid 0–100 focus (garbage becomes the centre). */
export function clampFocus(focus: { x: unknown; y: unknown }): CoverFocus {
  return { x: clampPercent(focus.x), y: clampPercent(focus.y) };
}

export function isCenterFocus(focus: CoverFocus | null | undefined): boolean {
  return !focus || (focus.x === 50 && focus.y === 50);
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
    const { data, error } = await supabase
      .from("album_cover_focus")
      .select("album_id, focus_x, focus_y")
      .in("album_id", [...albumIds]);
    if (error || !data) return result;
    for (const row of data) {
      result.set(row.album_id as string, clampFocus({ x: row.focus_x, y: row.focus_y }));
    }
  } catch {
    // Optional data: never let it break the page.
  }
  return result;
}

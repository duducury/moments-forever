/**
 * What a globe pin shows, decided as plain data so the DOM can be built with createElement /
 * textContent (never innerHTML). The thumbnail URL comes from the media proxy
 * (`/api/media/<id>?variant=thumbnail`) or from a `blob:` URL of a local copy, but whatever
 * reaches here is validated again: only those shapes, plus https, can become an <img src>.
 */

export type PinContent =
  | { readonly kind: "photo"; readonly src: string; readonly badge: number | null }
  | { readonly kind: "count"; readonly text: string };

/** Same-origin absolute path, blob: or https: URL; anything else (javascript:, data:, //host, control chars) is refused. */
export function safePinThumbUrl(url: string | undefined | null): string | null {
  if (typeof url !== "string") return null;
  const value = url.trim();
  if (value.length === 0 || value.length > 2048) return null;
  if (/[\u0000-\u001f\u007f\\]/u.test(value)) return null;
  if (value.startsWith("/")) return value.startsWith("//") ? null : value;
  if (/^blob:/iu.test(value)) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function describePinContent(input: {
  readonly thumbUrl: string | undefined;
  readonly count: number;
}): PinContent {
  const count = Number.isFinite(input.count) && input.count > 0 ? Math.floor(input.count) : 0;
  const src = safePinThumbUrl(input.thumbUrl);
  if (src) return { kind: "photo", src, badge: count > 1 ? count : null };
  return { kind: "count", text: String(count) };
}

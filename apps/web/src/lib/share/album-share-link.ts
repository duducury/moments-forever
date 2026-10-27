/**
 * The link that opens "this photo's album" for whoever receives it: the album's short link
 * (`/a/{code}`, which redirects to the real album page), taken from `/api/albums/{id}/short-link`.
 * There is no public page for a single photo, so the album link is what a photo shares.
 */

export type AlbumShareLink =
  /** A real, existing link. */
  | { readonly status: "ok"; readonly url: string }
  /** The album has no short link (not public / not found): there is nothing valid to share. */
  | { readonly status: "unavailable" }
  /** The lookup itself failed (offline, server error): try again later. */
  | { readonly status: "error" };

type FetchLike = (input: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

export async function fetchAlbumShareLink(
  albumId: string | null | undefined,
  fetchImpl: FetchLike = (input) => fetch(input),
): Promise<AlbumShareLink> {
  if (!albumId) return { status: "unavailable" };
  try {
    const response = await fetchImpl(`/api/albums/${encodeURIComponent(albumId)}/short-link`);
    if (response.status === 404 || response.status === 403 || response.status === 401) {
      return { status: "unavailable" };
    }
    if (!response.ok) return { status: "error" };
    const payload = (await response.json()) as { readonly url?: unknown };
    const url = typeof payload.url === "string" ? payload.url : "";
    return /^https?:\/\//iu.test(url) ? { status: "ok", url } : { status: "unavailable" };
  } catch {
    return { status: "error" };
  }
}

export const NO_PUBLIC_ALBUM_LINK_MESSAGE =
  "Este álbum ainda não tem um link público para compartilhar.";
export const SHARE_LINK_ERROR_MESSAGE = "Não foi possível gerar o link agora. Tente de novo.";

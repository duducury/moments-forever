/**
 * Canonical public profile is /{profileSlug}.
 * /perfil redirects the signed-in owner there.
 * Trip album URLs live under /perfil/[tripSlug]/album/[id].
 * /admin, /viagens and /trip/* redirect for compatibility.
 */

import { publicProfilePath } from "@/lib/profile/profile-slug";

export { publicProfilePath };

export function adminPath(): string {
  return profilePath();
}

/** @deprecated Prefer profileTripPath — trips open in the unified view. */
export function adminTripPath(slug: string): string {
  return profileTripPath(slug);
}

/** @deprecated Prefer profileTripAlbumPath. */
export function adminTripAlbumPath(slug: string, albumId: string): string {
  return profileTripAlbumPath(slug, albumId);
}

export function profilePath(): string {
  return "/perfil";
}

/**
 * What the bottom nav's "Mais" tab should be for a non-owner visitor:
 * back to their own profile if they're signed in, otherwise to login.
 * Owner keeps the default (Mais -> /geral) by getting {} back, so callers
 * can just spread the result onto AppBottomNav's optional props.
 */
export function visitorMoreNavProps(
  isOwner: boolean,
  viewerHasSession: boolean,
): { readonly moreHref?: string; readonly moreLabel?: string } {
  if (isOwner) return {};
  return viewerHasSession
    ? { moreHref: profilePath(), moreLabel: "Meu perfil" }
    : { moreHref: "/login", moreLabel: "Entrar" };
}

export function profileTripPath(slug: string): string {
  return `/perfil/${encodeURIComponent(slug)}`;
}

export function profileTripAlbumPath(
  slug: string,
  albumId: string,
  options?: { readonly photoId?: string },
): string {
  const path = `${profileTripPath(slug)}/album/${encodeURIComponent(albumId)}`;
  if (!options?.photoId) return path;
  return `${path}?photo=${encodeURIComponent(options.photoId)}`;
}

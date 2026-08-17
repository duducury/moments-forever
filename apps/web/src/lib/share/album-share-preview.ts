import type { Metadata } from "next";

import { profileTripAlbumPath } from "@/lib/routes/app-routes";
import { absoluteUrl } from "@/lib/site-url";

export type AlbumShareCoverCandidate = {
  readonly id: string;
  readonly hasFile: boolean;
  readonly positionInAlbum: number | null;
  readonly positionInMoment: number;
};

export type AlbumSharePreview = {
  readonly tripSlug: string;
  readonly albumId: string;
  readonly title: string;
  readonly description: string;
  readonly coverPhotoId: string | null;
  readonly coverWidth: number | null;
  readonly coverHeight: number | null;
};

const fallbackOgImage = {
  url: "/brand/icon-512.png",
  width: 512,
  height: 512,
  alt: "Moments Forever",
};

/**
 * Public cover bytes for WhatsApp / Open Graph.
 * `v` is the chosen photo id so crawlers refresh when the owner changes the cover.
 */
export function albumCoverPublicPath(
  albumId: string,
  coverPhotoId: string,
): string {
  return `/api/albums/${encodeURIComponent(albumId)}/cover?v=${encodeURIComponent(coverPhotoId)}`;
}

/** Same rule as the album hero: chosen cover, else first photo that is already in R2. */
export function pickAlbumShareCoverPhotoId(
  coverPhotoId: string | null,
  photos: readonly AlbumShareCoverCandidate[],
): string | null {
  const withFile = photos.filter((photo) => photo.hasFile);
  if (coverPhotoId) {
    const chosen = withFile.find((photo) => photo.id === coverPhotoId);
    if (chosen) return chosen.id;
  }

  const ordered = withFile.slice().sort((left, right) => {
    const leftPos = left.positionInAlbum ?? left.positionInMoment;
    const rightPos = right.positionInAlbum ?? right.positionInMoment;
    return leftPos - rightPos;
  });
  return ordered[0]?.id ?? null;
}

export function buildAlbumShareMetadata(preview: AlbumSharePreview): Metadata {
  const canonical = absoluteUrl(
    profileTripAlbumPath(preview.tripSlug, preview.albumId),
  );
  const hasCover = Boolean(preview.coverPhotoId);
  const image = hasCover && preview.coverPhotoId
    ? {
        url: absoluteUrl(
          albumCoverPublicPath(preview.albumId, preview.coverPhotoId),
        ),
        ...(preview.coverWidth && preview.coverHeight
          ? { width: preview.coverWidth, height: preview.coverHeight }
          : {}),
        alt: preview.title,
      }
    : {
        url: absoluteUrl(fallbackOgImage.url),
        width: fallbackOgImage.width,
        height: fallbackOgImage.height,
        alt: preview.title,
      };

  return {
    title: preview.title,
    description: preview.description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Moments Forever",
      title: preview.title,
      description: preview.description,
      url: canonical,
      images: [image],
    },
    twitter: {
      card: hasCover ? "summary_large_image" : "summary",
      title: preview.title,
      description: preview.description,
      images: [image.url],
    },
  };
}

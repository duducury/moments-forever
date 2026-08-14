export interface TripExperience {
  readonly id: string;
  readonly slug: string;
  readonly ownerId: string;
  readonly title: string;
  readonly description: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly primaryCity: string | null;
  readonly primaryCountry: string | null;
  readonly coverPhotoId: string | null;
  readonly status: string;
}

export interface TripAlbum {
  readonly id: string;
  readonly experienceId: string;
  readonly parentAlbumId: string | null;
  /** Raw album name from the database. */
  readonly name: string;
  /** Resolved label for UI (user name → suggestion → Local N). */
  readonly displayName: string;
  readonly description: string | null;
  readonly coverPhotoId: string | null;
  readonly position: number;
  readonly placeId: string | null;
  readonly placeName: string | null;
  readonly placeConfirmedByUser: boolean;
}

export interface TripPhoto {
  readonly id: string;
  readonly albumId: string | null;
  readonly momentId: string;
  readonly positionInAlbum: number | null;
  readonly positionInMoment: number;
  readonly capturedAt: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly exactLatitude: number | null;
  readonly exactLongitude: number | null;
  /** Resolved place/album label for map previews, when available. */
  readonly locationLabel: string | null;
  /** Trip slug when photo is shown on a multi-trip map (Abrir lugar). */
  readonly experienceSlug?: string | null;
  /**
   * False when `storage_key` is missing — `/api/media` will 404 until R2 upload
   * succeeds (IndexedDB may still show the photo on the upload device).
   */
  readonly hasPermanentStorage?: boolean;
}

export function photosWithGps(
  photos: readonly TripPhoto[],
): readonly TripPhoto[] {
  return photos.filter(
    (photo) =>
      photo.exactLatitude !== null &&
      photo.exactLongitude !== null &&
      Number.isFinite(photo.exactLatitude) &&
      Number.isFinite(photo.exactLongitude),
  );
}

export interface AlbumCardModel extends TripAlbum {
  readonly photoCount: number;
  readonly childCount: number;
  readonly previewPhotoId: string | null;
  readonly periodLabel: string | null;
}

export interface BreadcrumbItem {
  readonly label: string;
  readonly href: string | null;
}

export function buildAlbumCards(
  albums: readonly TripAlbum[],
  photos: readonly TripPhoto[],
  parentAlbumId: string | null,
): AlbumCardModel[] {
  const children = albums
    .filter((album) => album.parentAlbumId === parentAlbumId)
    .slice()
    .sort((a, b) => a.position - b.position);

  return children.map((album) => {
    const albumPhotos = photos
      .filter((photo) => photo.albumId === album.id)
      .slice()
      .sort(
        (a, b) =>
          (a.positionInAlbum ?? a.positionInMoment) -
          (b.positionInAlbum ?? b.positionInMoment),
      );
    const childCount = albums.filter(
      (candidate) => candidate.parentAlbumId === album.id,
    ).length;

    return {
      ...album,
      photoCount: albumPhotos.length,
      childCount,
      previewPhotoId: album.coverPhotoId ?? albumPhotos[0]?.id ?? null,
      periodLabel: formatPhotoPeriod(albumPhotos),
    };
  });
}

/**
 * Breadcrumb: Perfil → pasta (e subpastas).
 * Sem página intermediária de viagem completa.
 */
export function buildBreadcrumb(
  experience: Pick<TripExperience, "slug" | "title">,
  albums: readonly TripAlbum[],
  currentAlbumId: string | null,
  options?: {
    readonly isOwner?: boolean;
    readonly profileHomeHref?: string | null;
  },
): BreadcrumbItem[] {
  const albumHref = (albumId: string) =>
    `/perfil/${encodeURIComponent(experience.slug)}/album/${albumId}`;
  const isOwner = options?.isOwner ?? false;
  const profileHome = options?.profileHomeHref?.trim() || null;

  const items: BreadcrumbItem[] = [
    profileHome
      ? { label: "Perfil", href: profileHome }
      : isOwner
        ? { label: "Perfil", href: "/perfil" }
        : { label: "Início", href: "/" },
  ];

  if (!currentAlbumId) {
    return items;
  }

  const byId = new Map(albums.map((album) => [album.id, album]));
  const chain: TripAlbum[] = [];
  let cursor: string | null = currentAlbumId;
  const guard = new Set<string>();

  while (cursor && !guard.has(cursor)) {
    guard.add(cursor);
    const album = byId.get(cursor);
    if (!album) break;
    chain.unshift(album);
    cursor = album.parentAlbumId;
  }

  for (const [index, album] of chain.entries()) {
    const isLast = index === chain.length - 1;
    items.push({
      label: album.displayName,
      href: isLast ? null : albumHref(album.id),
    });
  }

  return items;
}

export function formatDateRange(
  startsAt: string | null,
  endsAt: string | null,
): string {
  if (!startsAt && !endsAt) {
    return "Período não informado";
  }
  const formatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });
  if (startsAt && endsAt) {
    return `${formatter.format(new Date(startsAt))} – ${formatter.format(new Date(endsAt))}`;
  }
  const single = startsAt ?? endsAt;
  return single ? formatter.format(new Date(single)) : "Período não informado";
}

export function locationLabel(
  city: string | null,
  country: string | null,
): string | null {
  if (city && country) return `${city}, ${country}`;
  return city ?? country;
}

export function sortAlbumPhotos(
  photos: readonly TripPhoto[],
  coverPhotoId: string | null,
): TripPhoto[] {
  const ordered = photos
    .slice()
    .sort(
      (a, b) =>
        (a.positionInAlbum ?? a.positionInMoment) -
        (b.positionInAlbum ?? b.positionInMoment),
    );

  if (!coverPhotoId) return ordered;
  const coverIndex = ordered.findIndex((photo) => photo.id === coverPhotoId);
  if (coverIndex <= 0) return ordered;
  const [cover] = ordered.splice(coverIndex, 1);
  return cover ? [cover, ...ordered] : ordered;
}

export function formatPhotoPeriod(
  photos: readonly TripPhoto[],
): string | null {
  const timestamps = photos
    .map((photo) => photo.capturedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) return null;

  const min = new Date(Math.min(...timestamps));
  const max = new Date(Math.max(...timestamps));
  const formatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });
  if (min.toDateString() === max.toDateString()) {
    return formatter.format(min);
  }
  return `${formatter.format(min)} – ${formatter.format(max)}`;
}

export function gpsCenter(
  photos: readonly TripPhoto[],
): { readonly latitude: number; readonly longitude: number } | null {
  const located = photosWithGps(photos);
  if (located.length === 0) return null;
  const latitude =
    located.reduce((sum, photo) => sum + (photo.exactLatitude as number), 0) /
    located.length;
  const longitude =
    located.reduce((sum, photo) => sum + (photo.exactLongitude as number), 0) /
    located.length;
  return { latitude, longitude };
}

export function toneFromId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % 4;
  }
  return String(hash);
}

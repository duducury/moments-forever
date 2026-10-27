/**
 * Profile grid cards = root place albums (pastas), not whole Experiences.
 * One import trip with 3 countries → 3 cards on /perfil.
 */

import {
  countryCodeFromStoredOrLabel,
  relabelForTerritory,
  usTerritoryAtCoordinates,
  resolveLocationDisplayName,
} from "@moments-forever/shared";

import { clampFocus, loadCoverFocusByAlbum, type CoverFocus } from "./cover-focus";
import { placeCardsJoinMode } from "@/lib/perf/flags";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

export interface OwnerPlaceCardItem {
  readonly albumId: string;
  readonly experienceId: string;
  readonly experienceSlug: string;
  readonly experienceTitle: string;
  readonly title: string;
  /** ISO 3166-1 alpha-2 from place label country, when known. */
  readonly countryCode: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly coverPhotoId: string | null;
  /** Where the owner centred the cover (null = default centre). */
  readonly coverFocus: CoverFocus | null;
  readonly previewPhotoIds: readonly string[];
  readonly photoCount: number;
}

type PlaceLink = {
  readonly name: string;
  readonly confirmed: boolean;
  /** Stored `places.country_code` (null until resolved / pre-migration). */
  readonly countryCode: string | null;
  /**
   * US territory (own ISO code) the place's coordinates sit in, for places the geocoder filed under the United
   * States (Nominatim answers "us" for Porto Rico). Computed here and never sent to the client.
   */
  readonly territory: string | null;
};

/** Territory of a place that is not user-confirmed and is filed as (or not yet resolved from) the US. */
function usTerritoryOfPlaceRow(place: Record<string, unknown>): string | null {
  if (place.confirmed_by_user) return null;
  const stored = typeof place.country_code === "string" ? place.country_code.trim().toUpperCase() : "";
  if (stored && stored !== "US") return null;
  return usTerritoryAtCoordinates(
    typeof place.exact_latitude === "number" ? place.exact_latitude : null,
    typeof place.exact_longitude === "number" ? place.exact_longitude : null,
  );
}

type AlbumRow = {
  readonly id: string;
  readonly experience_id: string;
  readonly name: string;
  readonly cover_photo_id: string | null;
  readonly position: number;
  readonly source_moment_id: string | null;
  readonly moment?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function placeLinkFromEmbed(momentEmbed: unknown): PlaceLink | null {
  const moment = asRecord(momentEmbed);
  if (!moment) return null;
  const place = asRecord(moment.place);
  if (!place || typeof place.name !== "string") return null;
  return {
    name: place.name,
    confirmed: Boolean(place.confirmed_by_user),
    countryCode:
      typeof place.country_code === "string" ? place.country_code : null,
    territory: usTerritoryOfPlaceRow(place),
  };
}

function toAlbumRow(row: Record<string, unknown>): AlbumRow {
  return {
    id: row.id as string,
    experience_id: row.experience_id as string,
    name: row.name as string,
    cover_photo_id: (row.cover_photo_id as string | null) ?? null,
    position: row.position as number,
    source_moment_id: (row.source_moment_id as string | null) ?? null,
    moment: row.moment,
  };
}

type AlbumStats = Map<
  string,
  { count: number; startsAt: string | null; endsAt: string | null }
>;

function statsFromPhotos(
  photos: readonly { album_id?: unknown; captured_at?: unknown }[],
): AlbumStats {
  const statsByAlbum: AlbumStats = new Map();
  for (const photo of photos) {
    const albumId = photo.album_id as string | null;
    if (!albumId) continue;
    const capturedAt = (photo.captured_at as string | null) ?? null;
    const current = statsByAlbum.get(albumId) ?? {
      count: 0,
      startsAt: null,
      endsAt: null,
    };
    current.count += 1;
    if (capturedAt) {
      if (!current.startsAt || capturedAt < current.startsAt) {
        current.startsAt = capturedAt;
      }
      if (!current.endsAt || capturedAt > current.endsAt) {
        current.endsAt = capturedAt;
      }
    }
    statsByAlbum.set(albumId, current);
  }
  return statsByAlbum;
}

function buildPlaceCards(input: {
  readonly albumRows: readonly AlbumRow[];
  readonly experienceById: ReadonlyMap<string, { slug: string; title: string }>;
  readonly placeNameByMomentId: ReadonlyMap<string, PlaceLink>;
  readonly statsByAlbum: AlbumStats;
  readonly focusByAlbum: ReadonlyMap<string, CoverFocus>;
}): OwnerPlaceCardItem[] {
  const { albumRows, experienceById, placeNameByMomentId, statsByAlbum, focusByAlbum } = input;
  const places: OwnerPlaceCardItem[] = albumRows.map((album) => {
    const experienceId = album.experience_id;
    const experience = experienceById.get(experienceId);
    const stats = statsByAlbum.get(album.id);
    const coverPhotoId = album.cover_photo_id;
    const momentId = album.source_moment_id;
    const linkedPlace = momentId ? placeNameByMomentId.get(momentId) : null;
    let title = resolveLocationDisplayName({
      albumName: album.name,
      placeName: linkedPlace?.name ?? null,
      placeConfirmedByUser: linkedPlace?.confirmed ?? false,
    });
    let countryCode = countryCodeFromStoredOrLabel({
      storedCode: linkedPlace?.countryCode,
      confirmedByUser: linkedPlace?.confirmed ?? false,
      labels: [title, linkedPlace?.name],
    });
    // Saved before territories were told apart: the geocoder filed Porto Rico under "us". The coordinates prove
    // it is the territory, so the card, flag and caption agree on PR (the stored row is not touched).
    const territory = linkedPlace?.territory ?? null;
    if (territory && (countryCode === "US" || countryCode === null)) {
      countryCode = territory;
      title = relabelForTerritory(title, territory);
    }

    return {
      albumId: album.id,
      experienceId,
      experienceSlug: experience?.slug ?? "",
      experienceTitle: experience?.title ?? title,
      title,
      countryCode,
      startsAt: stats?.startsAt ?? null,
      endsAt: stats?.endsAt ?? null,
      coverPhotoId,
      coverFocus: focusByAlbum.get(album.id) ?? null,
      previewPhotoIds: coverPhotoId ? [coverPhotoId] : [],
      photoCount: stats?.count ?? 0,
    };
  });

  places.sort((a, b) => comparePlaceRecency(a, b));
  return places;
}

type PlaceCardsResult =
  | { readonly places: readonly OwnerPlaceCardItem[]; readonly error: null }
  | { readonly places: null; readonly error: string };

type PlaceCardsOptions = { readonly publicOnly?: boolean };

export async function loadOwnerPlaceCardsSequential(
  supabase: ServerSupabase,
  ownerId: string,
  options?: PlaceCardsOptions,
): Promise<PlaceCardsResult> {
  // Stage 1: tiny experiences list (ids + labels only).
  let experiencesQuery = supabase
    .from("experiences")
    .select("id, slug, title")
    .eq("owner_id", ownerId);
  if (options?.publicOnly) {
    experiencesQuery = experiencesQuery
      .eq("visibility", "public")
      .eq("status", "published");
  }
  const experiences = await experiencesQuery.order("created_at", {
    ascending: false,
  });

  if (experiences.error) {
    return { places: null, error: experiences.error.message };
  }

  const experienceRows = experiences.data ?? [];
  if (experienceRows.length === 0) {
    return { places: [], error: null };
  }

  const experienceIds = experienceRows.map((row) => row.id as string);
  const experienceById = new Map(
    experienceRows.map((row) => [
      row.id as string,
      {
        slug: row.slug as string,
        title: row.title as string,
      },
    ]),
  );

  // Stage 2: albums (+ nested place) and photo stats in parallel — 1 RT each.
  const [albumsResult, photosResult] = await Promise.all([
    supabase
      .from("albums")
      .select(
        `
        id,
        experience_id,
        name,
        cover_photo_id,
        position,
        source_moment_id,
        moment:moments!albums_source_moment_fkey (
          place:places (
            name,
            confirmed_by_user,
            country_code,
            exact_latitude,
            exact_longitude
          )
        )
      `,
      )
      .in("experience_id", experienceIds)
      .is("parent_album_id", null)
      .order("position", { ascending: true }),
    supabase
      .from("photos")
      .select("album_id, captured_at")
      .in("experience_id", experienceIds),
  ]);

  // If the embed isn't available in this DB, fall back without place joins.
  let albumRows: AlbumRow[] = (albumsResult.data ?? []).map((row) =>
    toAlbumRow(row as Record<string, unknown>),
  );
  let placeNameByMomentId = new Map<string, PlaceLink>();

  if (albumsResult.error) {
    const fallbackAlbums = await supabase
      .from("albums")
      .select(
        "id, experience_id, name, cover_photo_id, position, source_moment_id",
      )
      .in("experience_id", experienceIds)
      .is("parent_album_id", null)
      .order("position", { ascending: true });

    if (fallbackAlbums.error) {
      return { places: null, error: fallbackAlbums.error.message };
    }
    albumRows = (fallbackAlbums.data ?? []).map((row) =>
      toAlbumRow(row as Record<string, unknown>),
    );
    placeNameByMomentId = await loadPlaceNamesByMoment(
      supabase,
      albumRows.map((album) => album.source_moment_id),
    );
  } else {
    for (const album of albumRows) {
      const momentId = album.source_moment_id;
      if (!momentId) continue;
      const link = placeLinkFromEmbed(
        Array.isArray(album.moment) ? album.moment[0] : album.moment,
      );
      if (link) placeNameByMomentId.set(momentId, link);
    }
  }

  if (photosResult.error) {
    return { places: null, error: photosResult.error.message };
  }

  const statsByAlbum = statsFromPhotos(photosResult.data ?? []);

  const focusByAlbum = await loadCoverFocusByAlbum(
    supabase,
    albumRows.map((album) => album.id),
  );

  const places = buildPlaceCards({
    albumRows,
    experienceById,
    placeNameByMomentId,
    statsByAlbum,
    focusByAlbum,
  });

  return { places, error: null };
}

/**
 * Same result as the sequential loader, in ONE round of parallel queries instead of three in a row
 * (experiences -> albums+photos -> cover focus). PostgREST joins the owner's experiences into each query
 * (`experiences!inner` + a filter on the embedded owner), so no query has to wait for another one's ids.
 * No SQL function or migration is involved: it only uses foreign keys that already exist.
 *
 * Any error, or an embed this database cannot resolve, returns null and the caller falls back to the sequential
 * loader, which is the proven path (it also handles the databases that lack the optional columns).
 */
export async function loadOwnerPlaceCardsJoined(
  supabase: ServerSupabase,
  ownerId: string,
  options?: PlaceCardsOptions,
  /** Told WHY the joined read was refused (database error text or a failed check; never row data). */
  onProblem?: (reason: string) => void,
): Promise<PlaceCardsResult | null> {
  const problem = (reason: string) => onProblem?.(reason.slice(0, 200));
  try {
    const publicOnly = Boolean(options?.publicOnly);

    let albumsQuery = supabase
      .from("albums")
      .select(
        `
        id,
        experience_id,
        name,
        cover_photo_id,
        position,
        source_moment_id,
        moment:moments!albums_source_moment_fkey (
          place:places (
            name,
            confirmed_by_user,
            country_code,
            exact_latitude,
            exact_longitude
          )
        ),
        experiences!inner (
          slug,
          title
        )
      `,
      )
      .is("parent_album_id", null)
      .eq("experiences.owner_id", ownerId);
    let photosQuery = supabase
      .from("photos")
      .select("album_id, captured_at, experiences!inner()")
      .eq("experiences.owner_id", ownerId);
    if (publicOnly) {
      albumsQuery = albumsQuery.eq("experiences.visibility", "public").eq("experiences.status", "published");
      photosQuery = photosQuery.eq("experiences.visibility", "public").eq("experiences.status", "published");
    }

    const [albumsResult, photosResult, focusResult] = await Promise.all([
      albumsQuery.order("position", { ascending: true }),
      photosQuery,
      supabase
        .from("album_cover_focus")
        .select("album_id, focus_x, focus_y, focus_zoom, albums!inner(experiences!inner())")
        .eq("albums.experiences.owner_id", ownerId),
    ]);

    if (albumsResult.error || photosResult.error) {
      problem(`query error: ${albumsResult.error?.message ?? photosResult.error?.message ?? "unknown"}`);
      return null;
    }

    const albumRows: AlbumRow[] = [];
    const experienceById = new Map<string, { slug: string; title: string }>();
    const placeNameByMomentId = new Map<string, PlaceLink>();
    for (const raw of albumsResult.data ?? []) {
      const row = raw as Record<string, unknown>;
      const album = toAlbumRow(row);
      albumRows.push(album);
      const embedded = asRecord(Array.isArray(row.experiences) ? row.experiences[0] : row.experiences);
      // An inner join always carries the experience; a row without it means the embed did not resolve as expected.
      if (!embedded || typeof embedded.slug !== "string" || typeof embedded.title !== "string") {
        problem("an album came back without its joined experience");
        return null;
      }
      if (!experienceById.has(album.experience_id)) {
        experienceById.set(album.experience_id, { slug: embedded.slug, title: embedded.title });
      }
      const momentId = album.source_moment_id;
      if (!momentId) continue;
      const link = placeLinkFromEmbed(Array.isArray(album.moment) ? album.moment[0] : album.moment);
      if (link) placeNameByMomentId.set(momentId, link);
    }
    if (albumRows.length === 0) return { places: [], error: null };

    // Cover focus is optional data (and its zoom column comes from a later migration): when this joined read
    // fails, the albums' own lookup (one more query, only in that case) gives the exact same answer.
    const focusByAlbum = new Map<string, CoverFocus>();
    if (focusResult.error) {
      for (const [id, focus] of await loadCoverFocusByAlbum(supabase, albumRows.map((album) => album.id))) {
        focusByAlbum.set(id, focus);
      }
    } else {
      for (const row of (focusResult.data ?? []) as unknown as {
        album_id: string;
        focus_x: unknown;
        focus_y: unknown;
        focus_zoom?: unknown;
      }[]) {
        focusByAlbum.set(row.album_id, clampFocus({ x: row.focus_x, y: row.focus_y, zoom: row.focus_zoom }));
      }
    }

    return {
      places: buildPlaceCards({
        albumRows,
        experienceById,
        placeNameByMomentId,
        statsByAlbum: statsFromPhotos(photosResult.data ?? []),
        focusByAlbum,
      }),
      error: null,
    };
  } catch (error) {
    problem(`exception: ${error instanceof Error ? error.name : "unknown"}`);
    return null;
  }
}

/**
 * Compares two loader results for the PLACE_CARDS_JOIN=compare log. It looks at EVERY field of every card (title,
 * country, dates, cover photo and focus, preview ids, photo count, experience slug and title) and reports only names
 * and counts, never values:
 *   "equal"                              same cards, same order;
 *   "order-differs"                      same cards in another order (ties with equal sort keys come back from the
 *                                        database in no guaranteed order, so this alone is not a data problem);
 *   "DIFFERENT fields=a,b missing=n extra=m"  the cards differ; `fields` names the card fields that changed;
 *   "unavailable"                        the joined loader could not answer (the caller falls back in that case).
 */
export function describePlaceCardsComparison(
  sequential: PlaceCardsResult,
  joined: PlaceCardsResult | null,
): string {
  if (joined === null) return "unavailable";
  if (sequential.places === null || joined.places === null) {
    return sequential.places === null && joined.places === null && sequential.error === joined.error
      ? "equal"
      : "DIFFERENT fields=error missing=0 extra=0";
  }
  const byId = (cards: readonly OwnerPlaceCardItem[]) => new Map(cards.map((card) => [card.albumId, card]));
  const a = byId(sequential.places);
  const b = byId(joined.places);
  const fields = new Set<string>();
  let missing = 0;
  let extra = 0;
  for (const [id, card] of a) {
    const other = b.get(id);
    if (!other) {
      missing += 1;
      continue;
    }
    for (const key of Object.keys(card) as (keyof OwnerPlaceCardItem)[]) {
      if (JSON.stringify(card[key]) !== JSON.stringify(other[key])) fields.add(key);
    }
  }
  for (const id of b.keys()) if (!a.has(id)) extra += 1;
  if (fields.size > 0 || missing > 0 || extra > 0) {
    return `DIFFERENT fields=${[...fields].sort().join(",") || "-"} missing=${missing} extra=${extra}`;
  }
  const sameOrder = sequential.places.every((card, index) => card.albumId === joined.places?.[index]?.albumId);
  return sameOrder ? "equal" : "order-differs";
}

/**
 * PLACE_CARDS_JOIN controls which loader serves the pages (read per call):
 *   unset / anything else  the sequential loader (the proven behaviour);
 *   "1"                    the joined loader, falling back to the sequential one on any problem;
 *   "compare"              runs BOTH, logs "[perf] place-cards joined=equal|DIFFERENT" (no data in the log) and
 *                          returns the sequential result: for validating the joined loader on a Preview.
 */
export async function loadOwnerPlaceCards(
  supabase: ServerSupabase,
  ownerId: string,
  options?: PlaceCardsOptions,
): Promise<PlaceCardsResult> {
  const mode = placeCardsJoinMode();
  if (mode === "on") {
    return (
      (await loadOwnerPlaceCardsJoined(supabase, ownerId, options)) ??
      loadOwnerPlaceCardsSequential(supabase, ownerId, options)
    );
  }
  if (mode === "compare") {
    let why = "";
    const [sequential, joined] = await Promise.all([
      loadOwnerPlaceCardsSequential(supabase, ownerId, options),
      loadOwnerPlaceCardsJoined(supabase, ownerId, options, (reason) => (why = reason)),
    ]);
    console.log(`[perf] place-cards joined=${describePlaceCardsComparison(sequential, joined)}${why ? ` why="${why}"` : ""}`);
    return sequential;
  }
  return loadOwnerPlaceCardsSequential(supabase, ownerId, options);
}

async function loadPlaceNamesByMoment(
  supabase: ServerSupabase,
  momentIdsRaw: readonly (string | null)[],
): Promise<Map<string, PlaceLink>> {
  const placeNameByMomentId = new Map<string, PlaceLink>();
  const momentIds = [
    ...new Set(momentIdsRaw.filter((id): id is string => Boolean(id))),
  ];
  if (momentIds.length === 0) return placeNameByMomentId;

  const moments = await supabase
    .from("moments")
    .select("id, place_id")
    .in("id", momentIds);
  const placeIds = [
    ...new Set(
      (moments.data ?? [])
        .map((moment) => moment.place_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (placeIds.length === 0) return placeNameByMomentId;

  const places = await supabase
    .from("places")
    .select("id, name, confirmed_by_user, country_code, exact_latitude, exact_longitude")
    .in("id", placeIds);
  const placesById = new Map<string, PlaceLink>();
  for (const place of places.data ?? []) {
    placesById.set(place.id as string, {
      name: place.name as string,
      confirmed: Boolean(place.confirmed_by_user),
      countryCode: typeof place.country_code === "string" ? place.country_code : null,
      territory: usTerritoryOfPlaceRow(place as Record<string, unknown>),
    });
  }
  for (const moment of moments.data ?? []) {
    const placeId = moment.place_id as string | null;
    if (!placeId) continue;
    const place = placesById.get(placeId);
    if (place) placeNameByMomentId.set(moment.id as string, place);
  }
  return placeNameByMomentId;
}

export function comparePlaceRecency(
  a: Pick<OwnerPlaceCardItem, "startsAt" | "endsAt" | "title">,
  b: Pick<OwnerPlaceCardItem, "startsAt" | "endsAt" | "title">,
): number {
  const ta = a.endsAt ?? a.startsAt ?? "";
  const tb = b.endsAt ?? b.startsAt ?? "";
  if (!ta && !tb) return a.title.localeCompare(b.title, "pt");
  if (!ta) return 1;
  if (!tb) return -1;
  if (ta !== tb) return tb.localeCompare(ta);
  return a.title.localeCompare(b.title, "pt");
}

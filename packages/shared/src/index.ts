import type {
  BuildExperienceDraftFromImportInput,
  DbPhotoDateSource,
  ExperienceImportDraft,
  ImportDateSource,
  LocalPhotoMetadata,
  PhotoDimensions,
  PhotoDraft,
  PhotoGps,
  PhotoGroupingConfig,
  PhotoImportDiagnostics,
  PhotoImportGroup,
  PhotoReadySummary,
  PhotoSelectionState,
  PlaceDraft,
} from "@moments-forever/types";

export type * from "@moments-forever/types";

import {
  cleanLocationLabel,
  isGenericLocationLabel,
} from "./location-name";

export {
  canApplySuggestedPlaceName,
  cleanLocationLabel,
  isGenericLocationLabel,
  resolveLocationDisplayName,
} from "./location-name";

export {
  GEOCODE_CACHE_DECIMALS,
  applySuggestedNamesById,
  collectGeocodeLookups,
  formatCountryLocality,
  geocodeCacheKey,
  localizeCountryName,
  pickTravelPlaceName,
  type GeocodeTarget,
  type NominatimAddress,
  type NominatimReverseLike,
} from "./geocode-place-name";

export {
  countryCodeFromName,
  countryCodeFromPlaceLabel,
  countryFlagFromPlaceLabel,
  countryNameFromPlaceLabel,
  flagEmojiFromCountryCode,
  shortPlaceCaption,
  usStateCodeFromPlaceLabel,
  type ShortPlaceCaption,
} from "./country-flag";

export {
  buildImportOrganizationChildren,
  buildImportOrganizationPlan,
  groupsForOrganizationMode,
  shortPlaceFolderName,
  suggestImportRootName,
} from "./import-organization";

export interface SupabasePublicConfig {
  readonly url: string;
  readonly anonKey: string;
}

export function readSupabasePublicConfig(
  url: string | undefined,
  anonKey: string | undefined,
): SupabasePublicConfig | null {
  const cleanUrl = url?.trim();
  const cleanKey = anonKey?.trim();

  if (!cleanUrl || !cleanKey) {
    return null;
  }

  return { url: cleanUrl, anonKey: cleanKey };
}

export const DEFAULT_PHOTO_GROUPING_CONFIG: PhotoGroupingConfig = {
  locationRadiusKm: 2,
  temporalWindowMs: 6 * 60 * 60 * 1_000,
  showRoundedCoordinates: false,
  coordinateDecimals: 2,
};

export interface RawPhotoMetadata {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly lastModified: number | null;
  readonly exifDate: string | number | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly orientation: number | null;
  readonly availableExifFields?: readonly string[];
  readonly cameraMake?: string | null;
  readonly cameraModel?: string | null;
  readonly warnings?: readonly string[];
  readonly analysisMs?: number;
}

function normalizedIsoDate(value: string | number | null): string | null {
  if (value === null || value === "") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeGps(
  latitude: number | null,
  longitude: number | null,
): PhotoGps | null {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

export function normalizeDimensions(
  width: number | null,
  height: number | null,
  orientation: number | null,
): PhotoDimensions | null {
  if (
    width === null ||
    height === null ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
    orientation:
      orientation !== null && Number.isFinite(orientation)
        ? Math.round(orientation)
        : null,
  };
}

export function createLocalFingerprint(input: {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number | null;
  readonly type: string;
}): string {
  return [
    input.name,
    String(input.size),
    input.lastModified === null ? "" : String(input.lastModified),
    input.type,
  ]
    .map((part) => encodeURIComponent(part))
    .join("|");
}

export function normalizePhotoMetadata(
  raw: RawPhotoMetadata,
): LocalPhotoMetadata {
  const exifDate = normalizedIsoDate(raw.exifDate);
  const fallbackDate =
    raw.lastModified !== null && raw.lastModified > 0
      ? normalizedIsoDate(raw.lastModified)
      : null;
  const date = exifDate ?? fallbackDate;
  return {
    id: raw.id,
    name: raw.name,
    size: Math.max(0, raw.size),
    type: raw.type,
    lastModified:
      raw.lastModified !== null && raw.lastModified > 0
        ? raw.lastModified
        : null,
    date,
    dateSource: exifDate
      ? "exif"
      : fallbackDate
        ? "file-last-modified"
        : "unknown",
    gps: normalizeGps(raw.latitude, raw.longitude),
    dimensions: normalizeDimensions(
      raw.width,
      raw.height,
      raw.orientation,
    ),
    exif: {
      availableFields: [...(raw.availableExifFields ?? [])].sort(),
      cameraMake: raw.cameraMake ?? null,
      cameraModel: raw.cameraModel ?? null,
      orientation:
        raw.orientation !== null && Number.isFinite(raw.orientation)
          ? Math.round(raw.orientation)
          : null,
    },
    fingerprint: createLocalFingerprint(raw),
    duplicateOf: null,
    warnings: [...(raw.warnings ?? [])],
    analysisMs: Math.max(0, raw.analysisMs ?? 0),
  };
}

export function flagDuplicatePhotos(
  photos: readonly LocalPhotoMetadata[],
): readonly LocalPhotoMetadata[] {
  const firstByFingerprint = new Map<string, string>();
  return photos.map((photo) => {
    const firstId = firstByFingerprint.get(photo.fingerprint);
    if (!firstId) {
      firstByFingerprint.set(photo.fingerprint, photo.id);
      return photo.duplicateOf === null ? photo : { ...photo, duplicateOf: null };
    }
    return { ...photo, duplicateOf: firstId };
  });
}

export function geographicDistanceKm(a: PhotoGps, b: PhotoGps): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const firstLatitude = radians(a.latitude);
  const secondLatitude = radians(b.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function groupLocatedPhotos(
  photos: readonly LocalPhotoMetadata[],
  config: PhotoGroupingConfig,
): readonly (readonly LocalPhotoMetadata[])[] {
  const located = photos.filter(
    (photo): photo is LocalPhotoMetadata & { readonly gps: PhotoGps } =>
      photo.gps !== null,
  );
  const cellDegrees = Math.max(config.locationRadiusKm / 111.32, 0.00001);
  const buckets = new Map<string, number[]>();
  const clusters: Array<{
    readonly anchor: PhotoGps;
    readonly members: LocalPhotoMetadata[];
    maxAnchorDistanceKm: number;
  }> = [];

  located.forEach((photo) => {
    const latitudeCell = Math.floor(photo.gps.latitude / cellDegrees);
    const longitudeCell = Math.floor(photo.gps.longitude / cellDegrees);
    const longitudeReach = Math.min(
      180,
      Math.max(
        1,
        Math.ceil(
          1 /
            Math.max(
              0.01,
              Math.cos((photo.gps.latitude * Math.PI) / 180),
            ),
        ),
      ),
    );
    const candidateClusters = new Set<number>();
    for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
      for (
        let longitudeOffset = -longitudeReach;
        longitudeOffset <= longitudeReach;
        longitudeOffset += 1
      ) {
        const candidates =
          buckets.get(
            `${latitudeCell + latitudeOffset}:${longitudeCell + longitudeOffset}`,
          ) ?? [];
        candidates.forEach((clusterIndex) =>
          candidateClusters.add(clusterIndex),
        );
      }
    }
    const matchingCluster = [...candidateClusters]
      .sort((first, second) => first - second)
      .find((clusterIndex) => {
        const cluster = clusters[clusterIndex];
        if (!cluster) return false;
        const anchorDistance = geographicDistanceKm(
          photo.gps,
          cluster.anchor,
        );
        return (
          anchorDistance + cluster.maxAnchorDistanceKm <=
          config.locationRadiusKm
        );
      });
    if (matchingCluster === undefined) {
      const clusterIndex = clusters.length;
      clusters.push({
        anchor: photo.gps,
        members: [photo],
        maxAnchorDistanceKm: 0,
      });
      const key = `${latitudeCell}:${longitudeCell}`;
      buckets.set(key, [...(buckets.get(key) ?? []), clusterIndex]);
      return;
    }
    const cluster = clusters[matchingCluster];
    if (cluster) {
      cluster.maxAnchorDistanceKm = Math.max(
        cluster.maxAnchorDistanceKm,
        geographicDistanceKm(photo.gps, cluster.anchor),
      );
      cluster.members.push(photo);
    }
  });
  return clusters.map((cluster) => cluster.members);
}

function locationGroupKind(
  photos: readonly LocalPhotoMetadata[],
  temporalWindowMs: number,
): "location-temporal" | "location" {
  if (photos.length < 2 || photos.some((photo) => photo.date === null)) {
    return "location";
  }
  const times = photos
    .map((photo) => new Date(photo.date ?? "").getTime())
    .sort((first, second) => first - second);
  return times.every(
    (time, index) =>
      index === 0 || time - (times[index - 1] ?? time) <= temporalWindowMs,
  )
    ? "location-temporal"
    : "location";
}

function roundedCenter(
  photos: readonly LocalPhotoMetadata[],
  decimals: number,
): PhotoGps {
  const located = photos.flatMap((photo) => (photo.gps ? [photo.gps] : []));
  const factor = 10 ** Math.max(0, Math.min(6, decimals));
  const latitude =
    located.reduce((sum, gps) => sum + gps.latitude, 0) / located.length;
  const longitude =
    located.reduce((sum, gps) => sum + gps.longitude, 0) / located.length;
  return {
    latitude: Math.round(latitude * factor) / factor,
    longitude: Math.round(longitude * factor) / factor,
  };
}

export function groupPhotos(
  photos: readonly LocalPhotoMetadata[],
  config: PhotoGroupingConfig = DEFAULT_PHOTO_GROUPING_CONFIG,
): readonly PhotoImportGroup[] {
  const groups: PhotoImportGroup[] = [];
  const locatedGroups = groupLocatedPhotos(photos, config);
  locatedGroups.forEach((members, index) => {
    const center = roundedCenter(members, config.coordinateDecimals);
    const coordinateSuffix = config.showRoundedCoordinates
      ? ` · ${center.latitude.toFixed(config.coordinateDecimals)}, ${center.longitude.toFixed(config.coordinateDecimals)}`
      : "";
    groups.push({
      id: `location-${index + 1}`,
      kind: locationGroupKind(members, config.temporalWindowMs),
      label: `Lugar ${index + 1}${coordinateSuffix}`,
      photoIds: members.map((photo) => photo.id),
      roundedGps: center,
      date: null,
    });
  });

  const withoutLocation = photos.filter((photo) => photo.gps === null);
  const byDate = new Map<string, string[]>();
  const unknown: string[] = [];
  for (const photo of withoutLocation) {
    if (photo.date) {
      const day = photo.date.slice(0, 10);
      byDate.set(day, [...(byDate.get(day) ?? []), photo.id]);
    } else {
      unknown.push(photo.id);
    }
  }
  [...byDate.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .forEach(([date, photoIds]) => {
      groups.push({
        id: `date-${date}`,
        kind: "date",
        label: `Data ${date} · local desconhecido`,
        photoIds,
        roundedGps: null,
        date,
      });
    });
  if (unknown.length > 0) {
    groups.push({
      id: "unknown",
      kind: "unknown",
      label: "Data e local desconhecidos",
      photoIds: unknown,
      roundedGps: null,
      date: null,
    });
  }
  return groups;
}

function manualGroup(
  group: PhotoImportGroup,
  photoIds: readonly string[],
): PhotoImportGroup {
  if (group.id === "unknown") {
    return {
      ...group,
      kind: "unknown",
      label: "Desconhecido",
      photoIds,
      roundedGps: null,
      date: null,
    };
  }
  return {
    ...group,
    kind: "manual",
    photoIds,
    roundedGps: null,
    date: null,
  };
}

function orderedPhotoSelection(
  groups: readonly PhotoImportGroup[],
  photoIds: readonly string[],
): readonly string[] {
  const requested = new Set(photoIds);
  if (requested.size === 0) {
    throw new Error("Selecione pelo menos uma foto.");
  }
  const ordered = groups.flatMap((group) =>
    group.photoIds.filter((id) => requested.has(id)),
  );
  if (new Set(ordered).size !== requested.size) {
    throw new Error("A seleção contém uma foto que não pertence aos grupos.");
  }
  return ordered;
}

export function isValidPhotoGroupPartition(
  groups: readonly PhotoImportGroup[],
  photoIds: readonly string[],
): boolean {
  if (groups.some((group) => group.photoIds.length === 0)) return false;
  if (new Set(groups.map((group) => group.id)).size !== groups.length) {
    return false;
  }
  const expected = new Set(photoIds);
  const assigned = groups.flatMap((group) => group.photoIds);
  if (assigned.length !== expected.size) return false;
  const uniqueAssigned = new Set(assigned);
  if (uniqueAssigned.size !== assigned.length) return false;
  return [...uniqueAssigned].every((id) => expected.has(id));
}

export function movePhotosToGroup(
  groups: readonly PhotoImportGroup[],
  photoIds: readonly string[],
  targetGroupId: string,
): readonly PhotoImportGroup[] {
  const ordered = orderedPhotoSelection(groups, photoIds);
  const target = groups.find((group) => group.id === targetGroupId);
  if (!target) throw new Error("O grupo de destino não existe.");
  const targetIds = new Set(target.photoIds);
  const additions = ordered.filter((id) => !targetIds.has(id));
  if (additions.length === 0) return groups;
  const moving = new Set(additions);
  return groups.flatMap((group) => {
    if (group.id === targetGroupId) {
      return [manualGroup(group, [...group.photoIds, ...additions])];
    }
    const remaining = group.photoIds.filter((id) => !moving.has(id));
    if (remaining.length === group.photoIds.length) return [group];
    return remaining.length > 0 ? [manualGroup(group, remaining)] : [];
  });
}

export function createPhotoGroup(
  groups: readonly PhotoImportGroup[],
  photoIds: readonly string[],
  newGroupId: string,
  label: string,
): readonly PhotoImportGroup[] {
  if (!newGroupId.startsWith("manual-")) {
    throw new Error("O identificador do grupo manual é inválido.");
  }
  if (groups.some((group) => group.id === newGroupId)) {
    throw new Error("Já existe um grupo com este identificador.");
  }
  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error("Informe um nome para o grupo.");
  const ordered = orderedPhotoSelection(groups, photoIds);
  const moving = new Set(ordered);
  const remainingGroups = groups.flatMap((group) => {
    const remaining = group.photoIds.filter((id) => !moving.has(id));
    if (remaining.length === group.photoIds.length) return [group];
    return remaining.length > 0 ? [manualGroup(group, remaining)] : [];
  });
  return [
    ...remainingGroups,
    {
      id: newGroupId,
      kind: "manual" as const,
      label: cleanLabel,
      photoIds: ordered,
      roundedGps: null,
      date: null,
    },
  ];
}

export function mergePhotoGroups(
  groups: readonly PhotoImportGroup[],
  groupIds: readonly string[],
  newGroupId: string,
  label: string,
): readonly PhotoImportGroup[] {
  const selectedIds = new Set(groupIds);
  if (selectedIds.size < 2) {
    throw new Error("Selecione pelo menos dois grupos.");
  }
  if (!newGroupId.startsWith("manual-")) {
    throw new Error("O identificador do grupo manual é inválido.");
  }
  if (
    groups.some(
      (group) => group.id === newGroupId && !selectedIds.has(group.id),
    )
  ) {
    throw new Error("Já existe um grupo com este identificador.");
  }
  const selectedGroups = groups.filter((group) => selectedIds.has(group.id));
  if (selectedGroups.length !== selectedIds.size) {
    throw new Error("A seleção contém um grupo que não existe.");
  }
  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error("Informe um nome para o grupo unido.");
  const firstSelectedIndex = groups.findIndex((group) =>
    selectedIds.has(group.id),
  );
  const merged: PhotoImportGroup = {
    id: newGroupId,
    kind: "manual",
    label: cleanLabel,
    photoIds: selectedGroups.flatMap((group) => group.photoIds),
    roundedGps: null,
    date: null,
  };
  return groups.flatMap((group, index) => {
    if (index === firstSelectedIndex) return [merged];
    return selectedIds.has(group.id) ? [] : [group];
  });
}

export function movePhotosToUnknown(
  groups: readonly PhotoImportGroup[],
  photoIds: readonly string[],
): readonly PhotoImportGroup[] {
  if (groups.some((group) => group.id === "unknown")) {
    return movePhotosToGroup(groups, photoIds, "unknown");
  }
  const ordered = orderedPhotoSelection(groups, photoIds);
  const moving = new Set(ordered);
  const remainingGroups = groups.flatMap((group) => {
    const remaining = group.photoIds.filter((id) => !moving.has(id));
    if (remaining.length === group.photoIds.length) return [group];
    return remaining.length > 0 ? [manualGroup(group, remaining)] : [];
  });
  return [
    ...remainingGroups,
    {
      id: "unknown",
      kind: "unknown" as const,
      label: "Desconhecido",
      photoIds: ordered,
      roundedGps: null,
      date: null,
    },
  ];
}

function uniqueIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)];
}

export function selectAll(photoIds: readonly string[]): PhotoSelectionState {
  return { selectedIds: uniqueIds(photoIds) };
}

export function deselectAll(): PhotoSelectionState {
  return { selectedIds: [] };
}

export function togglePhoto(
  state: PhotoSelectionState,
  photoId: string,
): PhotoSelectionState {
  const selected = new Set(state.selectedIds);
  if (selected.has(photoId)) selected.delete(photoId);
  else selected.add(photoId);
  return { selectedIds: [...selected] };
}

export function toggleGroup(
  state: PhotoSelectionState,
  photoIds: readonly string[],
): PhotoSelectionState {
  const selected = new Set(state.selectedIds);
  const shouldSelect = photoIds.some((id) => !selected.has(id));
  photoIds.forEach((id) =>
    shouldSelect ? selected.add(id) : selected.delete(id),
  );
  return { selectedIds: [...selected] };
}

export function selectionTotals(
  state: PhotoSelectionState,
  photos: readonly LocalPhotoMetadata[],
): { readonly count: number; readonly bytes: number } {
  const selected = new Set(state.selectedIds);
  return photos.reduce(
    (total, photo) =>
      selected.has(photo.id)
        ? { count: total.count + 1, bytes: total.bytes + photo.size }
        : total,
    { count: 0, bytes: 0 },
  );
}

export function readySummary(
  state: PhotoSelectionState,
  photos: readonly LocalPhotoMetadata[],
  groups: readonly PhotoImportGroup[],
): PhotoReadySummary {
  const totals = selectionTotals(state, photos);
  const selected = new Set(state.selectedIds);
  return {
    selectedCount: totals.count,
    selectedOriginalBytes: totals.bytes,
    selectedGroupCount: groups.filter((group) =>
      group.photoIds.some((id) => selected.has(id)),
    ).length,
  };
}

export function importDiagnostics(
  photos: readonly LocalPhotoMetadata[],
  groups: readonly PhotoImportGroup[],
  state: PhotoSelectionState,
  jsHeapBytes: number | null = null,
): PhotoImportDiagnostics {
  const totalAnalysisMs = photos.reduce(
    (sum, photo) => sum + photo.analysisMs,
    0,
  );
  return {
    total: photos.length,
    withGps: photos.filter((photo) => photo.gps !== null).length,
    withoutGps: photos.filter((photo) => photo.gps === null).length,
    withDate: photos.filter((photo) => photo.date !== null).length,
    withoutDate: photos.filter((photo) => photo.date === null).length,
    totalOriginalBytes: photos.reduce((sum, photo) => sum + photo.size, 0),
    totalAnalysisMs,
    averageAnalysisMs: photos.length === 0 ? 0 : totalAnalysisMs / photos.length,
    groups: groups.length,
    selected: state.selectedIds.length,
    duplicates: photos.filter((photo) => photo.duplicateOf !== null).length,
    jsHeapBytes,
  };
}

export interface MappedPhotoDate {
  readonly dateSource: DbPhotoDateSource;
  readonly capturedAt: string | null;
}

/**
 * Maps local/import date provenance to DB `photo_date_source`.
 * `file-last-modified` and unknown never become `captured_at`.
 * Bare `"exif"` is refined only via available EXIF field names — never invented.
 */
export function mapLocalDateSourceToDb(
  dateSource: ImportDateSource,
  localDate: string | null,
  availableExifFields: readonly string[] = [],
): MappedPhotoDate {
  if (dateSource === "file-last-modified" || dateSource === "unknown") {
    return { dateSource: "absent", capturedAt: null };
  }

  if (dateSource === "exif_original") {
    return localDate
      ? { dateSource: "exif_original", capturedAt: localDate }
      : { dateSource: "absent", capturedAt: null };
  }

  if (dateSource === "exif_created") {
    return localDate
      ? { dateSource: "exif_created", capturedAt: localDate }
      : { dateSource: "absent", capturedAt: null };
  }

  // dateSource === "exif"
  if (!localDate) {
    return { dateSource: "absent", capturedAt: null };
  }
  if (availableExifFields.includes("DateTimeOriginal")) {
    return { dateSource: "exif_original", capturedAt: localDate };
  }
  if (availableExifFields.includes("CreateDate")) {
    return { dateSource: "exif_created", capturedAt: localDate };
  }
  return { dateSource: "absent", capturedAt: null };
}

/** First photo in global moment/photo order — deterministic cover suggestion. */
export function suggestCoverPhotoId(
  photos: readonly Pick<PhotoDraft, "id" | "momentId" | "positionInMoment">[],
  momentOrder: readonly string[],
): string | null {
  if (photos.length === 0 || momentOrder.length === 0) {
    return null;
  }
  const momentRank = new Map(momentOrder.map((id, index) => [id, index]));
  const ordered = [...photos].sort((left, right) => {
    const leftMoment = momentRank.get(left.momentId) ?? Number.MAX_SAFE_INTEGER;
    const rightMoment =
      momentRank.get(right.momentId) ?? Number.MAX_SAFE_INTEGER;
    if (leftMoment !== rightMoment) {
      return leftMoment - rightMoment;
    }
    return left.positionInMoment - right.positionInMoment;
  });
  return ordered[0]?.id ?? null;
}

function gpsCentroid(points: readonly PhotoGps[]): PhotoGps {
  const latitude =
    points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const longitude =
    points.reduce((sum, point) => sum + point.longitude, 0) / points.length;
  return { latitude, longitude };
}

function periodFromCapturedAt(
  capturedAts: readonly (string | null)[],
): { readonly startsAt: string | null; readonly endsAt: string | null } {
  const times = capturedAts
    .filter((value): value is string => value !== null)
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((entry) => !Number.isNaN(entry.time))
    .sort((left, right) => left.time - right.time);
  const first = times[0];
  const last = times[times.length - 1];
  if (!first || !last) {
    return { startsAt: null, endsAt: null };
  }
  return {
    startsAt: first.value,
    endsAt: last.value,
  };
}

/**
 * Pure mapper: reviewed import groups + selection → Stage 1 persistence draft.
 * No I/O. Does not invent city/country or EXIF provenance.
 */
export function buildExperienceDraftFromImport(
  input: BuildExperienceDraftFromImportInput,
): ExperienceImportDraft {
  const selected = new Set(input.selectedIds);
  const photosById = new Map(input.photos.map((photo) => [photo.id, photo]));
  const experienceId = input.experienceId ?? `experience:${input.slug}`;

  const places: PlaceDraft[] = [];
  const moments: ExperienceImportDraft["moments"][number][] = [];
  const photos: PhotoDraft[] = [];

  let momentPosition = 0;
  for (const group of input.groups) {
    const selectedPhotoIds = group.photoIds.filter((id) => selected.has(id));
    if (selectedPhotoIds.length === 0) {
      continue;
    }

    momentPosition += 1;
    const momentId = `moment:${group.id}`;
    const momentPhotos = selectedPhotoIds
      .map((id) => photosById.get(id))
      .filter((photo): photo is LocalPhotoMetadata => photo !== undefined);

    const gpsPoints = momentPhotos
      .map((photo) => photo.gps)
      .filter((gps): gps is PhotoGps => gps !== null);

    const locationLabel = cleanLocationLabel(group.label);
    let placeId: string | null = null;
    if (group.kind !== "unknown" && gpsPoints.length > 0) {
      placeId = `place:${group.id}`;
      const center = gpsCentroid(gpsPoints);
      // Auto "Lugar N" stays unconfirmed so reverse geocoding can suggest a real name.
      // Manual groups (user-named at import) mark the place as confirmed.
      const confirmedByUser =
        group.kind === "manual" && !isGenericLocationLabel(locationLabel);
      places.push({
        id: placeId,
        experienceId,
        name: locationLabel,
        exactLatitude: center.latitude,
        exactLongitude: center.longitude,
        locationSource: "gps",
        confirmedByUser,
      });
    }

    const draftPhotosForMoment: PhotoDraft[] = momentPhotos.map(
      (photo, index) => {
        const mapped = mapLocalDateSourceToDb(
          photo.dateSource,
          photo.date,
          photo.exif.availableFields,
        );
        const gps = photo.gps;
        return {
          id: photo.id,
          experienceId,
          momentId,
          positionInMoment: index + 1,
          capturedAt: mapped.capturedAt,
          dateSource: mapped.dateSource,
          exactLatitude: gps?.latitude ?? null,
          exactLongitude: gps?.longitude ?? null,
          width: photo.dimensions?.width ?? null,
          height: photo.dimensions?.height ?? null,
          bytes: photo.size,
          format: photo.type || null,
        };
      },
    );
    photos.push(...draftPhotosForMoment);

    const period = periodFromCapturedAt(
      draftPhotosForMoment.map((photo) => photo.capturedAt),
    );
    moments.push({
      id: momentId,
      experienceId,
      placeId,
      title: locationLabel,
      position: momentPosition,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      confirmedByUser: true,
    });
  }

  const momentOrder = moments.map((moment) => moment.id);
  const coverPhotoId = suggestCoverPhotoId(photos, momentOrder);
  const experiencePeriod = periodFromCapturedAt(
    photos.map((photo) => photo.capturedAt),
  );

  return {
    experience: {
      id: experienceId,
      ownerId: input.ownerId,
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      startsAt: experiencePeriod.startsAt,
      endsAt: experiencePeriod.endsAt,
      primaryCity: null,
      primaryCountry: null,
      coverPhotoId,
      status: "draft",
      visibility: "private",
    },
    places,
    moments,
    photos,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function defaultGenerateId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  throw new Error("crypto.randomUUID is required.");
}

function resolvePersistedId(
  candidate: string,
  generateId: () => string,
): string {
  return isUuid(candidate) ? candidate : generateId();
}

/** JSON payload expected by public.create_experience_from_import */
export interface CreateExperienceFromImportPayload {
  readonly experience: {
    readonly id: string;
    readonly owner_id: string;
    readonly slug: string;
    readonly title: string;
    readonly description: string | null;
    readonly starts_at: string | null;
    readonly ends_at: string | null;
    readonly primary_city: string | null;
    readonly primary_country: string | null;
    readonly cover_photo_id: string | null;
    readonly status: "draft";
    readonly visibility: "private";
  };
  readonly places: readonly {
    readonly id: string;
    readonly name: string;
    readonly exact_latitude: number | null;
    readonly exact_longitude: number | null;
    readonly location_source: "gps" | "manual" | null;
    readonly confirmed_by_user: boolean;
  }[];
  readonly moments: readonly {
    readonly id: string;
    readonly place_id: string | null;
    readonly title: string | null;
    readonly position: number;
    readonly starts_at: string | null;
    readonly ends_at: string | null;
    readonly confirmed_by_user: boolean;
  }[];
  readonly photos: readonly {
    readonly id: string;
    readonly moment_id: string;
    readonly position_in_moment: number;
    readonly captured_at: string | null;
    readonly date_source: "exif_original" | "exif_created" | "absent";
    readonly exact_latitude: number | null;
    readonly exact_longitude: number | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly bytes: number | null;
    readonly format: string | null;
  }[];
}

export function buildCreateExperiencePayload(
  draft: ExperienceImportDraft,
  generateId: () => string = defaultGenerateId,
): CreateExperienceFromImportPayload {
  if (!isUuid(draft.experience.ownerId)) {
    throw new Error("experience.ownerId must be a UUID.");
  }

  const experienceId = resolvePersistedId(draft.experience.id, generateId);

  const placeIds = new Map<string, string>();
  for (const place of draft.places) {
    placeIds.set(place.id, resolvePersistedId(place.id, generateId));
  }

  const momentIds = new Map<string, string>();
  for (const moment of draft.moments) {
    momentIds.set(moment.id, resolvePersistedId(moment.id, generateId));
  }

  const photoIds = new Map<string, string>();
  for (const photo of draft.photos) {
    photoIds.set(photo.id, resolvePersistedId(photo.id, generateId));
  }

  const coverPhotoId =
    draft.experience.coverPhotoId === null
      ? null
      : (photoIds.get(draft.experience.coverPhotoId) ?? null);

  if (draft.experience.coverPhotoId !== null && coverPhotoId === null) {
    throw new Error("coverPhotoId must reference a photo in the draft.");
  }

  return {
    experience: {
      id: experienceId,
      owner_id: draft.experience.ownerId,
      slug: draft.experience.slug,
      title: draft.experience.title,
      description: draft.experience.description,
      starts_at: draft.experience.startsAt,
      ends_at: draft.experience.endsAt,
      primary_city: draft.experience.primaryCity,
      primary_country: draft.experience.primaryCountry,
      cover_photo_id: coverPhotoId,
      status: "draft",
      visibility: "private",
    },
    places: draft.places.map((place) => {
      const id = placeIds.get(place.id);
      if (!id) {
        throw new Error(`Missing place id mapping for ${place.id}.`);
      }
      return {
        id,
        name: place.name,
        exact_latitude: place.exactLatitude,
        exact_longitude: place.exactLongitude,
        location_source: place.locationSource,
        confirmed_by_user: place.confirmedByUser,
      };
    }),
    moments: draft.moments.map((moment) => {
      const placeId =
        moment.placeId === null
          ? null
          : (placeIds.get(moment.placeId) ?? null);
      if (moment.placeId !== null && placeId === null) {
        throw new Error(`Unknown placeId in moment ${moment.id}.`);
      }
      const momentId = momentIds.get(moment.id);
      if (!momentId) {
        throw new Error(`Missing moment id mapping for ${moment.id}.`);
      }
      return {
        id: momentId,
        place_id: placeId,
        title: moment.title,
        position: moment.position,
        starts_at: moment.startsAt,
        ends_at: moment.endsAt,
        confirmed_by_user: moment.confirmedByUser,
      };
    }),
    photos: draft.photos.map((photo) => {
      const momentId = momentIds.get(photo.momentId);
      const photoId = photoIds.get(photo.id);
      if (!momentId || !photoId) {
        throw new Error(`Missing id mapping for photo ${photo.id}.`);
      }
      return {
        id: photoId,
        moment_id: momentId,
        position_in_moment: photo.positionInMoment,
        captured_at: photo.capturedAt,
        date_source: photo.dateSource,
        exact_latitude: photo.exactLatitude,
        exact_longitude: photo.exactLongitude,
        width: photo.width,
        height: photo.height,
        bytes: photo.bytes,
        format: photo.format,
      };
    }),
  };
}

/** Slug canônico provisório (imutável após persistência). */
/**
 * Title for the single Experience created by one import.
 * Never uses place fallbacks ("Lugar N" / "Local N") — those are places inside the trip.
 */
export function suggestExperienceTitle(input: {
  readonly groups: readonly PhotoImportGroup[];
  readonly selectedIds: readonly string[];
  readonly photos?: readonly LocalPhotoMetadata[];
}): string {
  const selected = new Set(input.selectedIds);

  for (const group of input.groups) {
    if (!group.photoIds.some((id) => selected.has(id))) continue;
    const label = cleanLocationLabel(group.label);
    if (label && !isGenericLocationLabel(label) && group.kind === "manual") {
      return label;
    }
  }

  const dates = (input.photos ?? [])
    .filter((photo) => selected.has(photo.id) && photo.date)
    .map((photo) => photo.date!.slice(0, 10))
    .sort();
  if (dates.length > 0) {
    const year = dates[0]!.slice(0, 4);
    return `Viagem ${year}`;
  }

  return "Nova viagem";
}

export function suggestExperienceSlug(
  title: string,
  suffix = defaultGenerateId().slice(0, 8).toLowerCase(),
): string {
  const base =
    title
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "experiencia";
  const cleanSuffix = suffix.replace(/[^a-z0-9]+/g, "").slice(0, 12) || "draft";
  return `${base}-${cleanSuffix}`;
}

function normalizeSupabaseUrlInput(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function parseSupabaseUrl(url: string): URL {
  try {
    return new URL(normalizeSupabaseUrlInput(url));
  } catch {
    throw new Error("SUPABASE_URL must be a valid URL.");
  }
}

function isLocalSupabaseHost(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  return (
    (host === "127.0.0.1" || host === "localhost") &&
    (parsed.protocol === "http:" || parsed.protocol === "https:")
  );
}

function isHostedSupabaseUrl(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  return (
    parsed.protocol === "https:" &&
    (host.endsWith(".supabase.co") || host.endsWith(".supabase.in"))
  );
}

/** Local-only guard (backend / local tooling). */
export function assertLocalSupabaseUrl(url: string): string {
  const trimmed = normalizeSupabaseUrlInput(url);
  const parsed = parseSupabaseUrl(trimmed);
  if (!isLocalSupabaseHost(parsed)) {
    throw new Error(
      "Stage 1 persistence accepts only a local Supabase URL (localhost/127.0.0.1).",
    );
  }
  return trimmed;
}

/**
 * Web/runtime guard: local Supabase or hosted project URL (*.supabase.co).
 * Used by the Next.js app for Vercel + local development.
 */
export function assertSupabaseUrl(url: string): string {
  const trimmed = normalizeSupabaseUrlInput(url);
  const parsed = parseSupabaseUrl(trimmed);
  if (!isLocalSupabaseHost(parsed) && !isHostedSupabaseUrl(parsed)) {
    throw new Error(
      "SUPABASE_URL must be a local Supabase URL or a https://*.supabase.co project URL.",
    );
  }
  return trimmed;
}

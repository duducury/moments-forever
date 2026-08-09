/**
 * Client-side enrichment of import review groups via server Nominatim proxy.
 * Failures leave "Lugar N" labels untouched.
 */

import {
  canApplySuggestedPlaceName,
  isGenericLocationLabel,
  type LocalPhotoMetadata,
  type PhotoImportGroup,
} from "@moments-forever/shared";

function groupGpsCenter(
  group: PhotoImportGroup,
  photosById: ReadonlyMap<string, LocalPhotoMetadata>,
): { readonly latitude: number; readonly longitude: number } | null {
  if (group.roundedGps) {
    return group.roundedGps;
  }
  const located = group.photoIds.flatMap((id) => {
    const photo = photosById.get(id);
    return photo?.gps ? [photo.gps] : [];
  });
  if (located.length === 0) return null;
  const latitude =
    located.reduce((sum, gps) => sum + gps.latitude, 0) / located.length;
  const longitude =
    located.reduce((sum, gps) => sum + gps.longitude, 0) / located.length;
  return { latitude, longitude };
}

function groupConfirmedByUser(group: PhotoImportGroup): boolean {
  // Manual non-generic labels are treated as user-confirmed (draft rules).
  return group.kind === "manual" && !isGenericLocationLabel(group.label);
}

/**
 * Ask the server to reverse-geocode GPS groups and return updated labels.
 * Does not throw — returns the original groups on any failure.
 */
export async function enrichImportGroupLabels(
  groups: readonly PhotoImportGroup[],
  photos: readonly LocalPhotoMetadata[],
): Promise<readonly PhotoImportGroup[]> {
  const photosById = new Map(photos.map((photo) => [photo.id, photo]));

  const lookups = groups.flatMap((group) => {
    if (group.kind === "unknown" || group.kind === "date") return [];
    if (
      !canApplySuggestedPlaceName({
        name: group.label,
        confirmedByUser: groupConfirmedByUser(group),
      })
    ) {
      return [];
    }
    const center = groupGpsCenter(group, photosById);
    if (!center) return [];
    return [
      {
        id: group.id,
        latitude: center.latitude,
        longitude: center.longitude,
        name: group.label,
        confirmedByUser: groupConfirmedByUser(group),
      },
    ];
  });

  if (lookups.length === 0) return groups;

  try {
    const response = await fetch("/api/geocode/reverse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lookups }),
    });
    if (!response.ok) return groups;
    const payload = (await response.json()) as {
      readonly labels?: Readonly<Record<string, string>>;
    };
    const labels = payload.labels ?? {};
    if (Object.keys(labels).length === 0) return groups;

    return groups.map((group) => {
      const next = labels[group.id];
      if (!next || next === group.label) return group;
      if (
        !canApplySuggestedPlaceName({
          name: group.label,
          confirmedByUser: groupConfirmedByUser(group),
        })
      ) {
        return group;
      }
      return { ...group, label: next };
    });
  } catch {
    return groups;
  }
}

/**
 * Merge geocoded labels into the current review state without clobbering
 * user edits that happened while the request was in flight.
 */
export function mergeEnrichedGroupLabels(
  current: readonly PhotoImportGroup[],
  enriched: readonly PhotoImportGroup[],
): readonly PhotoImportGroup[] {
  const byId = new Map(enriched.map((group) => [group.id, group]));
  return current.map((group) => {
    const next = byId.get(group.id);
    if (!next || next.label === group.label) return group;
    if (
      !canApplySuggestedPlaceName({
        name: group.label,
        confirmedByUser: groupConfirmedByUser(group),
      })
    ) {
      return group;
    }
    return { ...group, label: next.label };
  });
}

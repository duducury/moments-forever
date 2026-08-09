/**
 * Pure helpers for the import organization step.
 * GPS on photos is never altered — only group → album structure.
 */

import type {
  ImportOrganizationChild,
  ImportOrganizationMode,
  ImportOrganizationPlan,
  LocalPhotoMetadata,
  PhotoImportGroup,
} from "@moments-forever/types";

import { cleanLocationLabel, isGenericLocationLabel } from "./location-name";

/** Short folder label from "País, Localidade" (or full label if no comma). */
export function shortPlaceFolderName(label: string): string {
  const cleaned = cleanLocationLabel(label);
  if (!cleaned) return "Lugar";
  const comma = cleaned.indexOf(",");
  if (comma > 0) {
    const locality = cleaned.slice(comma + 1).trim();
    if (locality) return locality;
  }
  return cleaned;
}

function selectedGroups(
  groups: readonly PhotoImportGroup[],
  selectedIds: ReadonlySet<string> | readonly string[],
): readonly {
  readonly group: PhotoImportGroup;
  readonly photoIds: readonly string[];
}[] {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  return groups
    .map((group) => ({
      group,
      photoIds: group.photoIds.filter((id) => selected.has(id)),
    }))
    .filter((item) => item.photoIds.length > 0);
}

/**
 * Suggest a root folder name from shared country / trip title.
 * Never invents a place that is not present in labels or title.
 */
export function suggestImportRootName(
  groups: readonly PhotoImportGroup[],
  selectedIds: readonly string[],
  experienceTitle?: string | null,
): string {
  const active = selectedGroups(groups, selectedIds);
  const countries = active
    .map(({ group }) => {
      const cleaned = cleanLocationLabel(group.label);
      if (!cleaned || isGenericLocationLabel(cleaned)) return null;
      const comma = cleaned.indexOf(",");
      if (comma > 0) {
        const country = cleaned.slice(0, comma).trim();
        return country || null;
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));

  if (countries.length > 0) {
    const unique = [...new Set(countries)];
    if (unique.length === 1 && unique[0]) return unique[0];
  }

  const localities = active
    .map(({ group }) => shortPlaceFolderName(group.label))
    .filter((name) => name && !isGenericLocationLabel(name));
  const uniqueLocalities = [...new Set(localities)];
  if (uniqueLocalities.length === 1 && uniqueLocalities[0]) {
    return uniqueLocalities[0];
  }

  const title = experienceTitle?.trim() ?? "";
  if (title && !isGenericLocationLabel(title) && !/^viagem\s+\d{4}$/iu.test(title)) {
    return title.replace(/\s+\d{4}\s*$/u, "").trim() || title;
  }

  return "Viagem";
}

export function buildImportOrganizationChildren(
  groups: readonly PhotoImportGroup[],
  selectedIds: readonly string[],
): ImportOrganizationChild[] {
  return selectedGroups(groups, selectedIds).map(({ group, photoIds }) => ({
    groupId: group.id,
    name: shortPlaceFolderName(group.label),
    photoIds,
  }));
}

export function buildImportOrganizationPlan(
  mode: ImportOrganizationMode,
  groups: readonly PhotoImportGroup[],
  selectedIds: readonly string[],
  rootName: string,
  childNames?: Readonly<Record<string, string>>,
): ImportOrganizationPlan {
  const children = buildImportOrganizationChildren(groups, selectedIds).map(
    (child) => ({
      ...child,
      name: childNames?.[child.groupId]?.trim() || child.name,
    }),
  );
  const cleanRoot = rootName.trim() || "Viagem";
  return { mode, rootName: cleanRoot, children };
}

/**
 * Groups used to build the Experience draft for a given organization mode.
 * - separate / nested: keep GPS groups (nested wraps albums after create)
 * - single: one manual group with the chosen root name
 */
export function groupsForOrganizationMode(
  mode: ImportOrganizationMode,
  groups: readonly PhotoImportGroup[],
  selectedIds: readonly string[],
  rootName: string,
  photos: readonly LocalPhotoMetadata[] = [],
): readonly PhotoImportGroup[] {
  if (mode === "separate" || mode === "nested") {
    return groups;
  }

  const selected = new Set(selectedIds);
  const photoIds = groups.flatMap((group) =>
    group.photoIds.filter((id) => selected.has(id)),
  );
  if (photoIds.length === 0) return groups;

  const photosById = new Map(photos.map((photo) => [photo.id, photo]));
  const located = photoIds.flatMap((id) => {
    const gps = photosById.get(id)?.gps;
    return gps ? [gps] : [];
  });
  const roundedGps =
    located.length > 0
      ? {
          latitude:
            located.reduce((sum, gps) => sum + gps.latitude, 0) / located.length,
          longitude:
            located.reduce((sum, gps) => sum + gps.longitude, 0) /
            located.length,
        }
      : null;

  return [
    {
      id: "manual-organized-single",
      kind: "manual",
      label: rootName.trim() || "Viagem",
      photoIds,
      roundedGps,
      date: null,
    },
  ];
}

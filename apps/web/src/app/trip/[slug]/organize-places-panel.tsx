"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  buildImportOrganizationPlan,
  groupPhotos,
  suggestImportRootName,
  type ImportOrganizationMode,
  type LocalPhotoMetadata,
} from "@moments-forever/shared";

import { OrganizePlacesStep } from "@/components/organize-places-step";

import type { TripPhoto } from "./album-types";
import styles from "./trip.module.css";

function toGroupingPhotos(
  photos: readonly TripPhoto[],
): readonly LocalPhotoMetadata[] {
  return photos.map((photo) => {
    const hasGps =
      photo.exactLatitude !== null &&
      photo.exactLongitude !== null &&
      Number.isFinite(photo.exactLatitude) &&
      Number.isFinite(photo.exactLongitude);
    return {
      id: photo.id,
      name: photo.id,
      size: 0,
      type: "image/jpeg",
      lastModified: null,
      date: photo.capturedAt,
      dateSource: photo.capturedAt ? "exif" : "unknown",
      gps: hasGps
        ? {
            latitude: photo.exactLatitude as number,
            longitude: photo.exactLongitude as number,
          }
        : null,
      dimensions:
        photo.width && photo.height
          ? {
              width: photo.width,
              height: photo.height,
              orientation: null,
            }
          : null,
      exif: {
        availableFields: [],
        cameraMake: null,
        cameraModel: null,
        orientation: null,
      },
      fingerprint: photo.id,
      duplicateOf: null,
      warnings: [],
      analysisMs: 0,
    };
  });
}

export function OrganizePlacesPanel({
  experienceId,
  experienceTitle,
  photos,
  onClose,
}: {
  readonly experienceId: string;
  readonly experienceTitle: string;
  readonly photos: readonly TripPhoto[];
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const groupingPhotos = useMemo(() => toGroupingPhotos(photos), [photos]);
  const groups = useMemo(
    () => groupPhotos(groupingPhotos),
    [groupingPhotos],
  );
  const selectedIds = useMemo(
    () => photos.map((photo) => photo.id),
    [photos],
  );

  const [mode, setMode] = useState<ImportOrganizationMode>("separate");
  const [rootName, setRootName] = useState(() =>
    suggestImportRootName(groups, selectedIds, experienceTitle),
  );
  const [childNames, setChildNames] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const organization = buildImportOrganizationPlan(
        mode,
        groups,
        selectedIds,
        rootName.trim() ||
          suggestImportRootName(groups, selectedIds, experienceTitle),
        childNames,
      );
      const response = await fetch(
        `/api/experiences/${experienceId}/organize`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ organization }),
        },
      );
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível organizar.");
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível organizar.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-label="Organizar lugares"
      aria-modal="true"
      className={styles.panel}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      role="dialog"
    >
      <div className={`${styles.panelCard} ${styles.organizePanelCard}`}>
        <OrganizePlacesStep
          busy={busy}
          childNames={childNames}
          confirmLabel="Aplicar organização"
          error={error}
          experienceTitle={experienceTitle}
          groups={groups}
          mode={mode}
          onBack={onClose}
          onChildNameChange={(groupId, name) => {
            setChildNames((current) => ({ ...current, [groupId]: name }));
          }}
          onConfirm={() => {
            void onConfirm();
          }}
          onModeChange={setMode}
          onRootNameChange={setRootName}
          photoCount={photos.length}
          rootName={rootName}
          selectedIds={selectedIds}
        />
      </div>
    </div>
  );
}

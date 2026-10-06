import type { LocalPhotoMetadata } from "@moments-forever/types";

import { validGeo } from "./geo";

/**
 * Where a File handed to the upload pipeline came from in the phone's library.
 * The library's own date and GPS are authoritative — better than whatever
 * survived the re-encode of the exported JPEG.
 */
export interface NativeOrigin {
  /** '<platform>:<native id>' — stored as photos.source_asset_id. */
  readonly sourceAssetId: string;
  readonly takenAt: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export type NativeOrigins = ReadonlyMap<File, NativeOrigin>;

/** Metadata as the pipeline would have read it, corrected with the library's own values. */
export function applyNativeOrigin(
  metadata: LocalPhotoMetadata,
  origin: NativeOrigin | undefined,
): LocalPhotoMetadata {
  if (!origin) return metadata;
  const gps = validGeo(origin.latitude, origin.longitude) ?? metadata.gps;
  const hasDate = Boolean(origin.takenAt && Number.isFinite(Date.parse(origin.takenAt)));
  if (!hasDate) return { ...metadata, gps };
  const fields = metadata.exif.availableFields;
  return {
    ...metadata,
    date: origin.takenAt,
    // "exif" + DateTimeOriginal is what mapLocalDateSourceToDb turns into exif_original.
    dateSource: "exif",
    exif: {
      ...metadata.exif,
      availableFields: fields.includes("DateTimeOriginal")
        ? fields
        : [...fields, "DateTimeOriginal"],
    },
    gps,
  };
}

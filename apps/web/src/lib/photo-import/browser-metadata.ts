import { parse } from "exifr";

import {
  normalizePhotoMetadata,
  type LocalPhotoMetadata,
} from "@moments-forever/shared";

const EXIF_FIELDS = [
  "DateTimeOriginal",
  "CreateDate",
  "ModifyDate",
  "GPSLatitude",
  "GPSLatitudeRef",
  "GPSLongitude",
  "GPSLongitudeRef",
  "latitude",
  "longitude",
  "ImageWidth",
  "ImageHeight",
  "ExifImageWidth",
  "ExifImageHeight",
  "Orientation",
  "Make",
  "Model",
] as const;

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateValue(value: unknown): string | number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return typeof value === "string" || typeof value === "number" ? value : null;
}

export async function parseBrowserExifFields(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<Readonly<Record<string, unknown>>> {
  const parsed: unknown = await parse(input, {
    pick: [...EXIF_FIELDS],
    translateValues: true,
    reviveValues: true,
    sanitize: true,
  });
  return asRecord(parsed);
}

function likelyLimitedBrowserFormat(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return (
    file.type.includes("heic") ||
    file.type.includes("heif") ||
    ["heic", "heif", "dng", "cr2", "cr3", "nef", "arw", "raf"].includes(
      extension ?? "",
    )
  );
}

export async function extractBrowserPhotoMetadata(
  id: string,
  file: File,
): Promise<LocalPhotoMetadata> {
  const startedAt = performance.now();
  const warnings: string[] = [];
  let fields: Readonly<Record<string, unknown>> = {};

  try {
    fields = await parseBrowserExifFields(file);
  } catch {
    warnings.push("Não foi possível ler os metadados EXIF neste navegador.");
  }

  if (likelyLimitedBrowserFormat(file)) {
    warnings.push(
      "HEIC/RAW pode não oferecer prévia ou todos os metadados no navegador.",
    );
  }

  const availableExifFields = EXIF_FIELDS.filter(
    (field) => fields[field] !== undefined && fields[field] !== null,
  );
  return normalizePhotoMetadata({
    id,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    lastModified: file.lastModified > 0 ? file.lastModified : null,
    exifDate:
      dateValue(fields.DateTimeOriginal) ??
      dateValue(fields.CreateDate),
    latitude: numberValue(fields.latitude),
    longitude: numberValue(fields.longitude),
    width:
      numberValue(fields.ExifImageWidth) ?? numberValue(fields.ImageWidth),
    height:
      numberValue(fields.ExifImageHeight) ?? numberValue(fields.ImageHeight),
    orientation: numberValue(fields.Orientation),
    availableExifFields,
    cameraMake: textValue(fields.Make),
    cameraModel: textValue(fields.Model),
    warnings,
    analysisMs: performance.now() - startedAt,
  });
}

export interface BrowserThumbnail {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

/** Default edge for map/strip thumbs — sharp enough on retina, still light. */
export const DEFAULT_THUMBNAIL_EDGE = 640;

export async function createBrowserThumbnail(
  file: File,
  maximumEdge = DEFAULT_THUMBNAIL_EDGE,
  quality = 0.88,
): Promise<BrowserThumbnail | null> {
  if (
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas === "undefined"
  ) {
    return null;
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maximumEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality,
    });
    return { blob, width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

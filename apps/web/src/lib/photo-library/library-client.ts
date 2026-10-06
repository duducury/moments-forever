/**
 * The web side of the native plugin: permission, scanning, thumbnails and
 * exporting the photos the person chose. The plugin is injected so the logic
 * (access states, paging, cancel, partial failures) is testable without a phone.
 */

import type {
  MomentsPhotoLibraryPlugin,
  PhotoPermissionStatus,
} from "@moments-forever/capacitor-photo-library";

import { buildSourceAssetId, type NativePlatform } from "./source-asset-id";
import type { NativeOrigin } from "./native-origin";
import type { LibraryAsset } from "./types";

export class LibraryCancelledError extends Error {
  constructor() {
    super("Busca cancelada.");
    this.name = "LibraryCancelledError";
  }
}

export interface AccessState {
  readonly status: PhotoPermissionStatus;
  /** Full or limited access: the library can be read. */
  readonly canRead: boolean;
  /** "Selected photos": only part of the library is visible. */
  readonly limited: boolean;
  /** Denied or restricted: only the system Settings can fix it. */
  readonly blocked: boolean;
}

function accessFrom(status: PhotoPermissionStatus): AccessState {
  return {
    status,
    canRead: status === "granted" || status === "limited",
    limited: status === "limited",
    blocked: status === "denied" || status === "restricted",
  };
}

export interface ScanOutcome {
  readonly assets: readonly LibraryAsset[];
  /** Photos the device reported (before filtering screenshots etc.). */
  readonly totalAssets: number;
  /** Time spent reading metadata on the device, in ms (sum of pages). */
  readonly nativeMs: number;
  /** Wall-clock time including the transfer to the WebView, in ms. */
  readonly totalMs: number;
}

export interface ExportOutcome {
  readonly files: readonly File[];
  readonly origins: ReadonlyMap<File, NativeOrigin>;
  /** Photos that could not be prepared (iCloud offline, deleted meanwhile…). */
  readonly failed: readonly LibraryAsset[];
}

const SCAN_PAGE = 4000;
const THUMBNAIL_BATCH = 40;

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function fileNameFor(asset: LibraryAsset, index: number): string {
  const stamp = asset.takenAt
    ? asset.takenAt.replace(/\D/gu, "").slice(0, 14)
    : String(index + 1).padStart(4, "0");
  return `IMG_${stamp}.jpg`;
}

export function createLibraryClient(input: {
  readonly plugin: MomentsPhotoLibraryPlugin;
  readonly platform: NativePlatform;
  readonly now?: () => number;
}) {
  const { plugin, platform } = input;
  const now = input.now ?? (() => performance.now());

  function throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) throw new LibraryCancelledError();
  }

  async function checkAccess(): Promise<AccessState> {
    return accessFrom((await plugin.checkPermission()).status);
  }

  /** Asks only when the system still has to ask; never re-prompts a decided answer. */
  async function ensureAccess(): Promise<AccessState> {
    const current = await checkAccess();
    if (current.canRead || current.blocked) return current;
    return accessFrom((await plugin.requestPermission()).status);
  }

  async function scan(options: {
    readonly onProgress?: (scanned: number) => void;
    readonly signal?: AbortSignal;
  } = {}): Promise<ScanOutcome> {
    const started = now();
    const assets: LibraryAsset[] = [];
    let offset = 0;
    let total = 0;
    let nativeMs = 0;

    for (;;) {
      throwIfCancelled(options.signal);
      const page = await plugin.scanPhotoMetadata({
        limit: SCAN_PAGE,
        offset,
        newestFirst: true,
        includeVideos: false,
        includeCloudShared: false,
        // Android has no GPS column: it is read per photo, page by page.
        readExifLocation: platform === "android",
      });
      throwIfCancelled(options.signal);

      total = page.diagnostics.totalAssets;
      nativeMs += page.diagnostics.scanDurationMs;
      for (const item of page.assets) {
        if (item.mediaType !== "image" || item.isScreenshot) continue;
        if (item.sourceType === "cloudShared") continue;
        assets.push({
          platform,
          nativeId: item.localIdentifier,
          takenAt: item.creationDate,
          latitude: item.latitude,
          longitude: item.longitude,
          width: item.width,
          height: item.height,
        });
      }
      offset += page.assets.length;
      options.onProgress?.(Math.min(offset, total));
      if (page.assets.length < SCAN_PAGE || offset >= total) break;
    }

    return { assets, totalAssets: total, nativeMs, totalMs: now() - started };
  }

  async function thumbnails(nativeIds: readonly string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (let start = 0; start < nativeIds.length; start += THUMBNAIL_BATCH) {
      const batch = nativeIds.slice(start, start + THUMBNAIL_BATCH);
      const response = await plugin.getThumbnails({ localIdentifiers: batch, size: 240 });
      for (const item of response.thumbnails) {
        if (item.data) result.set(item.localIdentifier, `data:image/jpeg;base64,${item.data}`);
      }
    }
    return result;
  }

  /** One at a time on purpose: the phone holds a single original in memory at once. */
  async function exportAssets(
    assets: readonly LibraryAsset[],
    options: {
      readonly onProgress?: (done: number, total: number) => void;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<ExportOutcome> {
    const files: File[] = [];
    const origins = new Map<File, NativeOrigin>();
    const failed: LibraryAsset[] = [];

    for (const [index, asset] of assets.entries()) {
      throwIfCancelled(options.signal);
      options.onProgress?.(index, assets.length);
      try {
        const exported = await plugin.exportPhoto({
          localIdentifier: asset.nativeId,
          maxDimension: 1600,
          quality: 0.85,
        });
        const file = new File([base64ToBytes(exported.data)], fileNameFor(asset, index), {
          type: exported.mimeType,
          lastModified: asset.takenAt ? Date.parse(asset.takenAt) : Date.now(),
        });
        files.push(file);
        origins.set(file, {
          sourceAssetId: buildSourceAssetId(platform, asset.nativeId),
          takenAt: asset.takenAt,
          latitude: asset.latitude,
          longitude: asset.longitude,
        });
      } catch {
        failed.push(asset);
      }
    }
    options.onProgress?.(assets.length, assets.length);
    return { files, origins, failed };
  }

  return {
    checkAccess,
    ensureAccess,
    scan,
    thumbnails,
    exportAssets,
    presentLimitedPicker: () => plugin.presentLimitedLibraryPicker(),
    openSettings: () => plugin.openSettings(),
  };
}

export type LibraryClient = ReturnType<typeof createLibraryClient>;

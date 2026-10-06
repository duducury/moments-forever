/**
 * Public contract of the MomentsPhotoLibrary Capacitor plugin.
 *
 * Discovery (`scanPhotoMetadata`) returns METADATA only — never pixels. Pixels
 * leave the plugin only for photos the person selected: small thumbnails for
 * the selection grid (`getThumbnails`) and one reduced JPEG per chosen photo
 * (`exportPhoto`), which then goes through the app's normal upload pipeline.
 * Nothing is ever sent to a server from here.
 */

export type PhotoPermissionStatus =
  /** Full access to the library. */
  | "granted"
  /** iOS "Selected Photos" / Android 14+ "Select photos": only what the user picked. */
  | "limited"
  | "denied"
  /** iOS only: blocked by Screen Time / MDM, the user cannot change it. */
  | "restricted"
  /** Never asked yet (Android cannot always tell this from "denied"). */
  | "notDetermined"
  /** Web/PWA, or a platform without a photo library. */
  | "unsupported";

export interface PermissionResult {
  readonly status: PhotoPermissionStatus;
  /** Raw platform value, for diagnostics (e.g. PHAuthorizationStatus name, Android SDK level). */
  readonly detail?: string;
}

export interface PhotoLibrarySummary {
  readonly permissionStatus: PhotoPermissionStatus;
  readonly platform: "ios" | "android" | "web";
  /** Photos visible to the app (all of them when full access, the picked subset when limited). */
  readonly photoCount: number;
  readonly videoCount: number;
  readonly totalAssets: number;
  /** How long the counting took on the device. */
  readonly durationMs: number;
}

export interface PhotoAssetMetadata {
  /** iOS PHAsset.localIdentifier / Android MediaStore _ID. Stable on the same device. */
  readonly localIdentifier: string;
  /** ISO-8601 UTC, or null when the asset has no usable capture date. */
  readonly creationDate: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly width: number;
  readonly height: number;
  readonly mediaType: "image" | "video";
  /** iOS only. */
  readonly isScreenshot?: boolean;
  /** iOS only: where the asset comes from (iCloud Shared Albums are "cloudShared"). */
  readonly sourceType?: "userLibrary" | "cloudShared" | "iTunesSynced" | "unknown";
}

export interface ScanOptions {
  /** How many assets to RETURN (default 100, hard max 50 000). Counters always cover the whole library. */
  readonly limit?: number;
  /** Skip this many assets before returning (for paging). Default 0. */
  readonly offset?: number;
  /** Newest first (default true). */
  readonly newestFirst?: boolean;
  readonly includeVideos?: boolean;
  /** iOS: also include assets from iCloud Shared Albums (other people's photos). Default false. */
  readonly includeCloudShared?: boolean;
  /**
   * Android: read GPS from the file's EXIF for the returned assets (needs the
   * ACCESS_MEDIA_LOCATION permission). Off by default; opens one file per asset.
   */
  readonly readExifLocation?: boolean;
}

export interface ScanDiagnostics {
  readonly permissionStatus: PhotoPermissionStatus;
  readonly platform: "ios" | "android" | "web";
  /** Assets the app can see (matching the media/source filters). */
  readonly totalAssets: number;
  /** Assets whose metadata was actually read (the counters below cover these). */
  readonly scannedAssets: number;
  /** Assets returned to JavaScript (the sample). */
  readonly returnedAssets: number;
  /** Native time to read metadata, excluding the bridge transfer to JavaScript. */
  readonly scanDurationMs: number;
  /**
   * How many scanned assets had their GPS looked at. iOS: all of them.
   * Android: only the returned ones, and only with `readExifLocation`.
   */
  readonly locationCheckedAssets: number;
  readonly assetsWithLocation: number;
  readonly assetsWithoutLocation: number;
  readonly assetsWithDate: number;
  readonly assetsWithoutDate: number;
  /** iOS: counts per PHAssetSourceType of the scanned assets. */
  readonly bySourceType?: Readonly<Record<string, number>>;
  /** Free-form platform notes worth showing in the report. */
  readonly notes?: readonly string[];
}

export interface ScanResult {
  readonly assets: readonly PhotoAssetMetadata[];
  readonly diagnostics: ScanDiagnostics;
}

export interface LimitedPickerResult {
  /** False when the library is not in "limited" mode (nothing to show). */
  readonly presented: boolean;
  readonly reason?: string;
  readonly newlySelectedCount?: number;
}

export interface ThumbnailsOptions {
  /** Native ids (`localIdentifier`) — at most 60 per call. */
  readonly localIdentifiers: readonly string[];
  /** Longest edge in pixels, 32–600 (default 240). */
  readonly size?: number;
}

export interface ThumbnailsResult {
  readonly thumbnails: readonly {
    readonly localIdentifier: string;
    /** Base64 JPEG, or null when the photo could not be loaded. */
    readonly data: string | null;
  }[];
}

export interface ExportPhotoOptions {
  readonly localIdentifier: string;
  /** Longest edge in pixels (default 1600, like the app's own preview). */
  readonly maxDimension?: number;
  /** JPEG quality 0.3–1 (default 0.85). */
  readonly quality?: number;
}

export interface ExportedPhoto {
  readonly localIdentifier: string;
  /** Base64 JPEG with EXIF/GPS preserved where the platform allows. */
  readonly data: string;
  readonly mimeType: "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

export interface MomentsPhotoLibraryPlugin {
  /** Current permission, without prompting. */
  checkPermission(): Promise<PermissionResult>;
  /** Shows the system prompt when the status is still undetermined. */
  requestPermission(): Promise<PermissionResult>;
  /** iOS limited access: opens the system "choose more photos" sheet. */
  presentLimitedLibraryPicker(): Promise<LimitedPickerResult>;
  /** Cheap counts only. Rejects with code PERMISSION_DENIED without access. */
  getPhotoLibrarySummary(): Promise<PhotoLibrarySummary>;
  /** Metadata only (never pixels). Rejects with code PERMISSION_DENIED without access. */
  scanPhotoMetadata(options?: ScanOptions): Promise<ScanResult>;
  /** Small pictures for the selection grid. Rejects with PERMISSION_DENIED without access. */
  getThumbnails(options: ThumbnailsOptions): Promise<ThumbnailsResult>;
  /**
   * One reduced JPEG, for a photo the person chose to add. Rejects with
   * PERMISSION_DENIED, ASSET_NOT_FOUND, ASSET_UNAVAILABLE (e.g. iCloud offline)
   * or EXPORT_FAILED.
   */
  exportPhoto(options: ExportPhotoOptions): Promise<ExportedPhoto>;
  /** Opens this app's page in the system Settings (for "access denied"). */
  openSettings(): Promise<void>;
}

import { WebPlugin } from "@capacitor/core";

import type {
  ExportedPhoto,
  LimitedPickerResult,
  MomentsPhotoLibraryPlugin,
  PickedPhotoInfo,
  PickPhotosResult,
  PermissionResult,
  PhotoLibrarySummary,
  ScanResult,
  ThumbnailsResult,
} from "./definitions";

/**
 * Web/PWA fallback. A website cannot read the device photo library, so every
 * data method rejects; callers should check availability first (see
 * `isPhotoLibraryAvailable`).
 */
export class MomentsPhotoLibraryWeb
  extends WebPlugin
  implements MomentsPhotoLibraryPlugin
{
  async checkPermission(): Promise<PermissionResult> {
    return { status: "unsupported", detail: "web" };
  }

  async requestPermission(): Promise<PermissionResult> {
    return { status: "unsupported", detail: "web" };
  }

  async presentLimitedLibraryPicker(): Promise<LimitedPickerResult> {
    return { presented: false, reason: "web" };
  }

  async getPhotoLibrarySummary(): Promise<PhotoLibrarySummary> {
    throw this.unavailable("Photo library is only available in the native app.");
  }

  async scanPhotoMetadata(): Promise<ScanResult> {
    throw this.unavailable("Photo library is only available in the native app.");
  }

  async getThumbnails(): Promise<ThumbnailsResult> {
    throw this.unavailable("Photo library is only available in the native app.");
  }

  async exportPhoto(): Promise<ExportedPhoto> {
    throw this.unavailable("Photo library is only available in the native app.");
  }

  async openSettings(): Promise<void> {
    throw this.unavailable("Photo library is only available in the native app.");
  }

  async pickPhotos(): Promise<PickPhotosResult> {
    throw this.unavailable("Photo library is only available in the native app.");
  }

  async preparePickedPhotos(): Promise<{ photos: readonly PickedPhotoInfo[] }> {
    throw this.unavailable("Photo library is only available in the native app.");
  }

  async readPickedPhoto(): Promise<{ data: string; mimeType: "image/jpeg" }> {
    throw this.unavailable("Photo library is only available in the native app.");
  }

  async discardPickedPhotos(): Promise<void> {
    throw this.unavailable("Photo library is only available in the native app.");
  }
}

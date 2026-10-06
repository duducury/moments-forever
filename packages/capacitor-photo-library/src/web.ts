import { WebPlugin } from "@capacitor/core";

import type {
  ExportedPhoto,
  LimitedPickerResult,
  MomentsPhotoLibraryPlugin,
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
}

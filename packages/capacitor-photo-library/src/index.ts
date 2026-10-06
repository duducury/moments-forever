import { Capacitor, registerPlugin } from "@capacitor/core";

import type {
  MomentsPhotoLibraryPlugin,
  PhotoPermissionStatus,
} from "./definitions";

export const MomentsPhotoLibrary =
  registerPlugin<MomentsPhotoLibraryPlugin>("MomentsPhotoLibrary", {
    web: () => import("./web").then((m) => new m.MomentsPhotoLibraryWeb()),
  });

/**
 * True only inside the native app AND when this build of the app contains the
 * native half of the plugin. An older App Store binary has neither, so UI that
 * needs the library must hide itself when this is false.
 */
export function isPhotoLibraryAvailable(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("MomentsPhotoLibrary")
  );
}

export * from "./definitions";

/** Permission states in which the library can be read (fully or partially). */
export function canReadLibrary(status: PhotoPermissionStatus): boolean {
  return status === "granted" || status === "limited";
}

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

/**
 * True when this build of the app can open the system photo picker directly
 * (iOS, and the native side already has `pickPhotos` + `preparePickedPhotos`). An app installed before
 * the picker existed has the plugin but not this method, so the menu must fall
 * back to the file input there. Answered synchronously on purpose: the tap that
 * opens the picker has to stay a user gesture.
 */
export function isNativePhotoPickerAvailable(): boolean {
  if (Capacitor.getPlatform() !== "ios" || !isPhotoLibraryAvailable()) return false;
  const headers = (
    Capacitor as unknown as {
      PluginHeaders?: ReadonlyArray<{
        name: string;
        methods?: ReadonlyArray<{ name: string }>;
      }>;
    }
  ).PluginHeaders;
  const plugin = headers?.find((header) => header.name === "MomentsPhotoLibrary");
  const has = (name: string) => Boolean(plugin?.methods?.some((method) => method.name === name));
  return has("pickPhotos") && has("preparePickedPhotos");
}

export * from "./definitions";

/** Permission states in which the library can be read (fully or partially). */
export function canReadLibrary(status: PhotoPermissionStatus): boolean {
  return status === "granted" || status === "limited";
}

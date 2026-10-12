import { Capacitor, registerPlugin } from "@capacitor/core";

import type { MomentsNativeAuthPlugin } from "./definitions";

export type {
  MomentsNativeAuthPlugin,
  NativeAuthStartOptions,
  NativeAuthStartResult,
} from "./definitions";

export const MomentsNativeAuth = registerPlugin<MomentsNativeAuthPlugin>(
  "MomentsNativeAuth",
  { web: () => import("./web").then((m) => new m.MomentsNativeAuthWeb()) },
);

/**
 * True only inside the iOS or Android app AND when this build contains the
 * native half of the plugin. An app installed before it existed (iOS 3.2 and
 * older) has neither, so callers must fall back to the browser redirect flow
 * when this is false.
 */
export function isNativeAuthAvailable(): boolean {
  const platform = Capacitor.getPlatform();
  return (
    (platform === "ios" || platform === "android") &&
    Capacitor.isPluginAvailable("MomentsNativeAuth")
  );
}

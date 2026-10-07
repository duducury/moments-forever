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
 * True only inside the iOS app AND when this build contains the native half of
 * the plugin. An app installed before it existed (3.2 and older) has neither,
 * so callers must fall back to the browser redirect flow when this is false.
 */
export function isNativeAuthAvailable(): boolean {
  return (
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("MomentsNativeAuth")
  );
}

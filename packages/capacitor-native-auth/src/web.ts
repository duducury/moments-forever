import { WebPlugin } from "@capacitor/core";

import type {
  MomentsNativeAuthPlugin,
  NativeAuthStartResult,
} from "./definitions";

/** The website keeps using the browser redirect flow; this is never called there. */
export class MomentsNativeAuthWeb
  extends WebPlugin
  implements MomentsNativeAuthPlugin
{
  async start(): Promise<NativeAuthStartResult> {
    throw this.unavailable("Native OAuth is only available in the iOS app.");
  }
}

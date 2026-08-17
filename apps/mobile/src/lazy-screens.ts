/* Lazy screen loading keeps auth, OAuth and secondary flows off the startup bundle. */
/* eslint-disable @typescript-eslint/no-require-imports */

import type { ComponentType } from "react";

import type { RootStackParamList } from "./navigation";

type LazyScreenName = Exclude<keyof RootStackParamList, "Home">;

const screens: Record<LazyScreenName, () => ComponentType<object>> = {
  Login: () => require("./screens/login-screen").LoginScreen,
  Collection: () => require("./screens/collection-screen").CollectionScreen,
  CreateMemory: () => require("./screens/create-memory-screen").CreateMemoryScreen,
  Settings: () => require("./screens/settings-screen").SettingsScreen,
};

export function getLazyScreen(name: LazyScreenName): ComponentType<object> {
  return screens[name]();
}

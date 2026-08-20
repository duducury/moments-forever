"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";
import { fetchWithTimeout } from "./fetch-with-timeout";

export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  return createBrowserClient(config.url, config.anonKey, {
    global: {
      fetch: fetchWithTimeout(),
    },
  });
}

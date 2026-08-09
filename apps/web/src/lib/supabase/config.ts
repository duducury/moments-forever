import {
  assertSupabaseUrl,
  readSupabasePublicConfig,
} from "@moments-forever/shared";

/**
 * Public Supabase config for the web app.
 * Returns null when unset/invalid so Next.js build/prerender does not crash.
 */
export function getSupabaseConfig() {
  const config = readSupabasePublicConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!config) {
    return null;
  }

  try {
    return {
      url: assertSupabaseUrl(config.url),
      anonKey: config.anonKey,
    };
  } catch {
    return null;
  }
}

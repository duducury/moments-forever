import {
  assertLocalSupabaseUrl,
  readSupabasePublicConfig,
} from "@moments-forever/shared";

export function getSupabaseConfig() {
  const config = readSupabasePublicConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!config) {
    return null;
  }

  // Stage 1: web persistence and auth point only at local Supabase.
  return {
    url: assertLocalSupabaseUrl(config.url),
    anonKey: config.anonKey,
  };
}

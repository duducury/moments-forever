import { assertLocalSupabaseUrl } from "@moments-forever/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export { assertLocalSupabaseUrl } from "@moments-forever/shared";

export interface LocalSupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

export function readLocalSupabaseConfig(
  source: NodeJS.ProcessEnv,
): LocalSupabaseConfig {
  const url = source.SUPABASE_URL?.trim();
  const anonKey = source.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY are required for local persistence.",
    );
  }

  return {
    url: assertLocalSupabaseUrl(url),
    anonKey,
  };
}

export function createLocalSupabaseClient(
  config: LocalSupabaseConfig,
  accessToken?: string,
): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

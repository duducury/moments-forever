import {
  assertSupabaseUrl,
  readSupabasePublicConfig,
} from "@moments-forever/shared";

function cleanEnv(value: string | undefined): string | undefined {
  // Strip UTF-8 BOM / quotes that sometimes appear in .env files on Windows.
  const cleaned = value?.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return undefined;
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    return cleaned.slice(1, -1).trim() || undefined;
  }
  return cleaned;
}

/**
 * Public Supabase config for the web app.
 * Returns null when unset/invalid so Next.js build/prerender does not crash.
 */
export function getSupabaseConfig() {
  const config = readSupabasePublicConfig(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
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

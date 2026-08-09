import { assertLocalSupabaseUrl } from "./supabase/local-client.js";

export interface ServerEnv {
  readonly port: number;
  readonly nodeEnv: "development" | "test" | "production";
  readonly supabaseUrl: string | null;
  readonly supabaseAnonKey: string | null;
}

export function readServerEnv(source: NodeJS.ProcessEnv): ServerEnv {
  const port = Number(source.PORT ?? "4000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const nodeEnv = source.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production.");
  }

  const supabaseUrl = source.SUPABASE_URL?.trim() || null;
  const supabaseAnonKey = source.SUPABASE_ANON_KEY?.trim() || null;
  if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be configured together.",
    );
  }

  if (supabaseUrl) {
    assertLocalSupabaseUrl(supabaseUrl);
  }

  return {
    port,
    nodeEnv: nodeEnv as ServerEnv["nodeEnv"],
    supabaseUrl,
    supabaseAnonKey,
  };
}

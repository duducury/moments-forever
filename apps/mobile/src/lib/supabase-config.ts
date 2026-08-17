export interface SupabasePublicConfig {
  readonly url: string;
  readonly anonKey: string;
}

export function readSupabasePublicConfig(
  url: string | undefined,
  anonKey: string | undefined,
): SupabasePublicConfig | null {
  const cleanUrl = url?.trim();
  const cleanKey = anonKey?.trim();

  if (!cleanUrl || !cleanKey) {
    return null;
  }

  return { url: cleanUrl, anonKey: cleanKey };
}

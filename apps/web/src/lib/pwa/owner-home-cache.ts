const OWNER_HOME_CACHE_KEY = "mf-owner-home";

export type OwnerHomeCache = {
  readonly userId: string;
  readonly path: string;
};

const BLOCKED_HOME_PATHS = new Set(["/", "/login", "/perfil"]);

export function isSafeOwnerHomePath(path: string): boolean {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("://") ||
    path.includes("\\")
  ) {
    return false;
  }
  const pathname = path.split("?")[0]?.replace(/\/+$/u, "") || "/";
  return !BLOCKED_HOME_PATHS.has(pathname);
}

export function readOwnerHomeCache(
  raw: string | null,
  userId: string,
): string | null {
  if (!raw || !userId) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OwnerHomeCache>;
    if (
      parsed.userId === userId &&
      typeof parsed.path === "string" &&
      isSafeOwnerHomePath(parsed.path)
    ) {
      return parsed.path;
    }
  } catch {
    return null;
  }
  return null;
}

export function serializeOwnerHomeCache(entry: OwnerHomeCache): string {
  return JSON.stringify(entry);
}

export function ownerHomeCacheKey(): string {
  return OWNER_HOME_CACHE_KEY;
}

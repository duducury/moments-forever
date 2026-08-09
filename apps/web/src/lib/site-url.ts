/**
 * Absolute public origin for Open Graph / share previews.
 * Prefer NEXT_PUBLIC_SITE_URL in production (stable canonical host).
 */
export function getSiteUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "";
  if (explicit) {
    return explicit.replace(/\/+$/u, "");
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//u, "").replace(/\/+$/u, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  if (!path) return base;
  if (/^https?:\/\//u.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

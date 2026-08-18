/**
 * Absolute public origin for Open Graph / share previews.
 * Prefer NEXT_PUBLIC_SITE_URL in production (stable canonical host).
 */
function originFromHost(value: string): string {
  const host = value.replace(/^https?:\/\//u, "").replace(/\/+$/u, "");
  return `https://${host}`;
}

export function getSiteUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "";
  if (explicit) {
    return explicit.replace(/\/+$/u, "");
  }

  // Stable production alias — never VERCEL_URL (unique *.vercel.app host).
  // Those unique hosts are often behind Vercel SSO and look like a white
  // login screen when saved to the iPhone Home Screen.
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    return originFromHost(production);
  }

  const branch = process.env.VERCEL_BRANCH_URL?.trim();
  if (branch) {
    return originFromHost(branch);
  }

  return "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  if (!path) return base;
  if (/^https?:\/\//u.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * After "Entrar com Google", Supabase sends the browser back to the requested
 * redirect URL with `?code=...` — but only if that URL is in the project's
 * "Redirect URLs" allow-list; otherwise it falls back to the Site URL, i.e.
 * the landing page "/". The browser client still completes the sign-in there
 * (detectSessionInUrl), so the user ends up logged in on the landing page.
 * A `code` query param on the landing page therefore means "just came back
 * from an OAuth login".
 */
export function isOAuthReturn(search: string): boolean {
  return Boolean(new URLSearchParams(search).get("code"));
}

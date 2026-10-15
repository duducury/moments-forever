/**
 * The user id written in the session cookie's access token, read locally (no network, no signature check).
 *
 * ONLY for starting reads early, in parallel with `auth.getUser()`, which is what actually authenticates the request:
 * the caller must compare this id with the verified user and discard the early results when they differ or when
 * `getUser()` finds nobody. The early reads still run with the caller's own token, so row-level security decides what
 * they can see; a forged cookie gets nothing from them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function peekSessionUserId(supabase: Pick<SupabaseClient, "auth">): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const payload = token?.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    // An expired token gets no early reads: they would only be rejected, and getUser() decides anyway.
    if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;
    return typeof claims.sub === "string" && claims.sub.length > 0 ? claims.sub : null;
  } catch {
    return null;
  }
}

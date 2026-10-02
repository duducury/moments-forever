import { profileTripAlbumPath } from "./app-routes";

/** The slice of the Supabase client this lookup uses (kept narrow for tests). */
export interface NfcTagLookupClient {
  rpc(
    fn: "resolve_nfc_token",
    args: { p_token: string },
  ): PromiseLike<{ data: unknown; error: unknown }>;
  from(table: "experiences"): {
    select(columns: "slug"): {
      eq(
        column: "id",
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: { slug?: unknown } | null;
          error: unknown;
        }>;
      };
    };
  };
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Relative Location, like redirect() emitted — never depends on the request origin. */
function temporaryRedirect(location: string): Response {
  return new Response(null, {
    status: 307,
    headers: { Location: location, ...NO_STORE },
  });
}

/**
 * Where a tag that resolves to nothing lands (same page content as before).
 * rawToken is the route param, already percent-encoded as a path segment.
 */
export function notLinkedPath(rawToken: string): string {
  return `/n/${rawToken}/nao-vinculada`;
}

/**
 * Public NFC tag redirect. resolve_nfc_token() returns the exact
 * {trip_id, album_id} the tag was linked to — never the nfc_tags row itself
 * — so this redirects straight to that specific album, the same one the
 * owner selected when they created the tag. It never re-derives "the first
 * root album of this experience": that used to be the resolution rule here,
 * and it could silently disagree with which album was actually linked
 * whenever an experience has more than one root album (e.g. "Dubai" and
 * "Bali" as two destinations under the same import trip). Whether the
 * resolved trip/album is actually visible to this visitor is then decided by
 * the normal RLS policies on `experiences`/`albums`, exactly like every other
 * public page.
 *
 * This is a plain HTTP 307 rather than a page that calls redirect(): under
 * the root loading.tsx a page redirect is streamed as a 200 document plus a
 * client-side refresh, i.e. a second full document load on every tag tap.
 */
export async function nfcTagRedirectResponse(
  supabase: NfcTagLookupClient | null,
  rawToken: string,
): Promise<Response> {
  const notLinked = () => temporaryRedirect(notLinkedPath(rawToken));

  const token = decodeURIComponent(rawToken).trim();
  if (!token) return notLinked();

  if (!supabase) return notLinked();

  const resolved = await supabase.rpc("resolve_nfc_token", { p_token: token });
  const row = (
    resolved.data as
      | readonly { readonly trip_id: string; readonly album_id: string }[]
      | null
  )?.[0];
  if (resolved.error || !row?.trip_id || !row.album_id) {
    return notLinked();
  }

  const experience = await supabase
    .from("experiences")
    .select("slug")
    .eq("id", row.trip_id)
    .maybeSingle();
  if (experience.error || !experience.data?.slug) return notLinked();

  return temporaryRedirect(
    profileTripAlbumPath(experience.data.slug as string, row.album_id),
  );
}

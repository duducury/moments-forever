import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { hasAuthCookie, supabaseAuthCookieName } from "@/lib/pwa/native-launch";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Keeps signed-in people signed in.
 *
 * The Supabase access token lasts about an hour. Server components and route
 * handlers can't write cookies, so without this nothing on the server ever
 * renewed it: after a while away, pages and APIs saw the person as signed out
 * until the browser happened to refresh the session on its own. This renews
 * the session on the server whenever it is (nearly) expired and writes the new
 * tokens back with a real Set-Cookie header — which, unlike cookies written
 * from JavaScript, Safari doesn't cap at 7 days.
 *
 * It only acts when a session cookie is present, and getSession() makes no
 * network call while the token is still valid, so it costs nothing for
 * visitors and next to nothing for signed-in requests.
 */
/** Longest the proxy waits for a session refresh before letting the request through. */
const REFRESH_TIMEOUT_MS = 3000;

export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  const cookieName = config ? supabaseAuthCookieName(config.url) : null;
  if (
    !config ||
    !cookieName ||
    !hasAuthCookie(request.headers.get("cookie") ?? "", cookieName)
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        // Pass the renewed tokens on to this request's own server render...
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        // ...and to the browser.
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // supabase-js retries a failing refresh with backoff for a long time; never
  // let a Supabase outage hold the page hostage.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      supabase.auth.getSession(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, REFRESH_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // A failed refresh (offline, Supabase hiccup) must never block the request;
    // the page still renders and the browser client retries on its own.
  } finally {
    clearTimeout(timer);
  }

  return response;
}

export const config = {
  // Everything except Next internals and plain static files.
  matcher: [
    // `n/<token>` is the NFC tag page: a static splash served straight from the
    // CDN (see next.config.ts), so no function — not even this one — may sit in
    // front of it. The tag is resolved through /api/nfc-link, which does pass here.
    "/((?!_next/static|_next/image|favicon.ico|n/[^/]+$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|mp4|ico|woff2?|txt|xml|json|map)$).*)",
  ],
};

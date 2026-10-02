/**
 * Cold start of the native (Capacitor) app loads "/", the marketing landing,
 * even for someone who is already signed in; they then have to tap through to
 * their profile. For that case only, send them straight to /perfil before the
 * landing body is even parsed.
 *
 * This is a routing hint, not an access decision: the presence of the
 * Supabase session cookie only chooses where to go first. /perfil does the
 * real session check and sends anyone without a valid session to /login.
 * Everyone else (no cookie, plain browser, any other path) is left alone.
 */
export const NATIVE_LAUNCH_TARGET = "/perfil";
export const NATIVE_LAUNCH_STORAGE_KEY = "mf-native-launch-handled";

/** supabase-js default storage key: sb-<first label of the project host>-auth-token. */
export function supabaseAuthCookieName(supabaseUrl: string): string | null {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** The session cookie is split into `<name>.0`, `<name>.1`... when it is large. */
export function hasAuthCookie(cookieHeader: string, cookieName: string): boolean {
  return cookieHeader.split(";").some((part) => {
    const name = part.trim().split("=")[0];
    return name === cookieName || name.startsWith(`${cookieName}.`);
  });
}

export function shouldRedirectOnNativeLaunch(input: {
  readonly isNative: boolean;
  readonly pathname: string;
  readonly hasSessionCookie: boolean;
  readonly alreadyHandled: boolean;
}): boolean {
  return (
    input.isNative &&
    input.pathname === "/" &&
    input.hasSessionCookie &&
    !input.alreadyHandled
  );
}

/**
 * Inline <head> script, run before first paint. Must stay in sync with the
 * functions above (see the test, which executes it against a fake browser).
 * Does nothing unless every condition holds, and never throws.
 */
export function nativeLaunchRedirectScript(cookieName: string): string {
  const name = JSON.stringify(cookieName);
  const key = JSON.stringify(NATIVE_LAUNCH_STORAGE_KEY);
  const target = JSON.stringify(NATIVE_LAUNCH_TARGET);
  return `(()=>{try{var c=window.Capacitor;if(!(c&&typeof c.isNativePlatform==="function"&&c.isNativePlatform()))return;if(location.pathname!=="/")return;var n=${name},ok=document.cookie.split(";").some(function(p){var k=p.trim().split("=")[0];return k===n||k.indexOf(n+".")===0});if(!ok)return;var s=window.sessionStorage;if(s.getItem(${key}))return;s.setItem(${key},"1");location.replace(${target})}catch(_){}})();`;
}

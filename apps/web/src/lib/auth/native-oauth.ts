/**
 * Google / Facebook login INSIDE the iOS app.
 *
 * In a browser the OAuth redirect flow works as usual (nothing here runs).
 * Inside the Capacitor shell it cannot: the shell hands any navigation to
 * another origin over to Safari, so the login used to end there. Here the same
 * Supabase flow runs in Apple's ASWebAuthenticationSession sheet
 * (packages/capacitor-native-auth), which closes itself when the provider
 * redirects to the app's callback and hands that URL back:
 *
 *   signInWithOAuth(redirectTo = com.momentsforever.app://auth/callback,
 *                   skipBrowserRedirect)            → PKCE verifier stays in this web view
 *   sheet → provider → Supabase → com.momentsforever.app://auth/callback?code=…
 *   → validated here → this web view opens the EXISTING /auth/callback?code=…
 *   → server exchanges the code with the verifier → session cookies → /perfil
 *
 * `com.momentsforever.app://auth/callback` must be in Supabase's Redirect URLs.
 * Apps installed before this existed (no native plugin) keep the old flow.
 */

import { isNativeIosApp } from "@/lib/auth/apple-sign-in";

/** Same as the bundle id and the scheme fixed in MomentsNativeAuthPlugin.swift. */
export const NATIVE_OAUTH_CALLBACK_SCHEME = "com.momentsforever.app";
export const NATIVE_OAUTH_REDIRECT_URL = `${NATIVE_OAUTH_CALLBACK_SCHEME}://auth/callback`;

const PLUGIN_NAME = "MomentsNativeAuth";

type NativeAuthProvider = "google" | "facebook";

type CapacitorGlobal = {
  readonly isNativePlatform?: () => boolean;
  readonly getPlatform?: () => string;
  readonly isPluginAvailable?: (name: string) => boolean;
};

function readCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/**
 * True only in the iOS app AND when this build has the native plugin. The 3.2
 * app and older do not, so they keep using the browser redirect flow.
 */
export function isNativeOAuthAvailable(
  capacitor: CapacitorGlobal | undefined = readCapacitor(),
): boolean {
  try {
    return isNativeIosApp(capacitor) && Boolean(capacitor?.isPluginAvailable?.(PLUGIN_NAME));
  } catch {
    return false;
  }
}

export type NativeOAuthCallback =
  | { readonly status: "code"; readonly code: string }
  /** The person said no on the provider's page (`error=access_denied`). */
  | { readonly status: "cancelled" }
  | { readonly status: "error" }
  | { readonly status: "invalid" };

/** Supabase auth codes are UUIDs today; keep the check loose but bounded. */
const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/;

/**
 * Accepts ONLY `com.momentsforever.app://auth/callback` (no credentials, port or
 * other host/path) and extracts the one thing that is needed: the code.
 */
export function parseNativeOAuthCallback(raw: string): NativeOAuthCallback {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { status: "invalid" };
  }
  if (
    url.protocol !== `${NATIVE_OAUTH_CALLBACK_SCHEME}:` ||
    url.hostname !== "auth" ||
    url.pathname !== "/callback" ||
    url.username ||
    url.password ||
    url.port
  ) {
    return { status: "invalid" };
  }
  if (url.searchParams.get("error") === "access_denied") return { status: "cancelled" };
  if (url.searchParams.get("error") || url.searchParams.get("error_description")) {
    return { status: "error" };
  }
  const code = url.searchParams.get("code");
  if (!code || !CODE_PATTERN.test(code)) return { status: "invalid" };
  return { status: "code", code };
}

/** The existing web callback route, with the code and where to go after. */
export function webCallbackPath(code: string, next?: string): string {
  const params = new URLSearchParams({ code });
  if (next) params.set("next", next);
  return `/auth/callback?${params.toString()}`;
}

/** Closing the login sheet is the person's choice, not a failure: say so calmly. */
export const NATIVE_OAUTH_CANCELLED_MESSAGE = "O login foi cancelado. Tente novamente.";

export type NativeOAuthResult =
  | { readonly status: "redirecting" }
  | { readonly status: "cancelled"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

/** The slice of the Supabase browser client this flow needs. */
export interface NativeOAuthSupabaseClient {
  readonly auth: {
    signInWithOAuth(credentials: {
      provider: NativeAuthProvider;
      options: { redirectTo: string; skipBrowserRedirect: boolean; queryParams?: { prompt: string } };
    }): Promise<{
      data: { url: string | null } | null;
      error: { message: string } | null;
    }>;
  };
}

export interface NativeOAuthOptions {
  /** Where /auth/callback should land afterwards (it only accepts its own allowlist). */
  readonly next?: string;
  /** Host the authorize URL must belong to: the Supabase project. */
  readonly supabaseUrl: string | undefined;
  readonly start?: (url: string) => Promise<string>;
  readonly navigate?: (path: string) => void;
}

const GENERIC_ERROR = "Não foi possível entrar. Tente novamente.";

async function startNativeSession(url: string): Promise<string> {
  const { MomentsNativeAuth } = await import("@moments-forever/capacitor-native-auth");
  return (await MomentsNativeAuth.start({ url })).url;
}

function isCancellation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "CANCELLED" || /cancel/i.test(String((error as Error | null)?.message ?? ""));
}

function authorizeUrlIsTrusted(candidate: string, supabaseUrl: string | undefined): boolean {
  try {
    if (!supabaseUrl) return false;
    const url = new URL(candidate);
    return url.protocol === "https:" && url.hostname === new URL(supabaseUrl).hostname;
  } catch {
    return false;
  }
}

export async function signInWithNativeOAuth(
  client: NativeOAuthSupabaseClient,
  provider: NativeAuthProvider,
  options: NativeOAuthOptions,
): Promise<NativeOAuthResult> {
  const start = options.start ?? startNativeSession;
  const navigate = options.navigate ?? ((path: string) => window.location.assign(path));

  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: NATIVE_OAUTH_REDIRECT_URL,
      skipBrowserRedirect: true,
      // Google only: always show its account chooser (the accounts signed in on Safari).
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    },
  });
  if (error) {
    return {
      status: "error",
      message: error.message.includes("provider is not enabled")
        ? "Login com esse provedor ainda não está disponível."
        : error.message,
    };
  }
  if (!data?.url || !authorizeUrlIsTrusted(data.url, options.supabaseUrl)) {
    return { status: "error", message: GENERIC_ERROR };
  }

  let callbackUrl: string;
  try {
    callbackUrl = await start(data.url);
  } catch (caught) {
    if (isCancellation(caught)) {
      return { status: "cancelled", message: NATIVE_OAUTH_CANCELLED_MESSAGE };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  const callback = parseNativeOAuthCallback(callbackUrl);
  if (callback.status === "cancelled") {
    return { status: "cancelled", message: NATIVE_OAUTH_CANCELLED_MESSAGE };
  }
  if (callback.status !== "code") return { status: "error", message: GENERIC_ERROR };

  navigate(webCallbackPath(callback.code, options.next));
  return { status: "redirecting" };
}

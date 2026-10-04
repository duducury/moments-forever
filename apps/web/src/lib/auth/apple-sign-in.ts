/**
 * Native "Sign in with Apple" for the Capacitor iOS shell.
 *
 * The OAuth redirect flow can't work inside the shell (Capacitor hands any
 * top-level navigation to another origin over to Safari), so the app shows
 * Apple's own sheet through the @capacitor-community/apple-sign-in plugin and
 * trades the identity token it returns for a Supabase session with
 * `signInWithIdToken` — no redirects, nothing leaves the web view.
 *
 * Nonce: Apple embeds whatever string we hand the sheet in the identity token,
 * and Supabase compares that claim to SHA-256(<raw nonce> we pass it). So the
 * sheet gets the HASH and Supabase gets the RAW value; the raw value never
 * leaves this module until the token comes back.
 */

/** Same as the Capacitor appId / bundle id (see capacitor.config.ts). Supabase's Apple provider must list it under Client IDs. */
export const APPLE_NATIVE_CLIENT_ID = "com.momentsforever.app";

/** Plugin API requires a redirectURI; the native sheet never uses it. */
const APPLE_UNUSED_REDIRECT_URI = "https://momentsforever.vercel.app";

// ---------------------------------------------------------------------------
// TEMP-APPLE-DEBUG — temporary diagnostics for the on-device Sign in with Apple
// failure. Observation only: it never changes what the flow does. It logs
// booleans, lengths and error fields — never the identity token, the
// authorization code, the raw nonce, or any credential. Remove with the
// "[APPLE-DEBUG]" calls once the cause is found.
// ---------------------------------------------------------------------------
const DEBUG_PREFIX = "[APPLE-DEBUG]";

/** Strip anything that looks like a JWT, in case an error message echoes one. */
function redact(text: string): string {
  return text.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[jwt-redacted]").slice(0, 600);
}

export function appleDebugLog(step: string, details?: Record<string, unknown>): void {
  try {
    console.log(DEBUG_PREFIX, step, details ? redact(JSON.stringify(details)) : "");
  } catch {
    // Logging must never affect the flow.
  }
}

function pick(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  const value = (source as Record<string, unknown>)[key];
  if (value === undefined || value === null) return undefined;
  return typeof value === "object" ? safeJson(value) : value;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Every field that helps tell a plugin error from a Supabase/Auth error. */
export function describeError(error: unknown): Record<string, unknown> {
  if (error === null || error === undefined) return { error: String(error) };
  const isObject = typeof error === "object";
  return {
    type: typeof error,
    constructor: isObject ? (error as object).constructor?.name : undefined,
    name: pick(error, "name"),
    message: isObject ? pick(error, "message") : String(error),
    code: pick(error, "code"),
    status: pick(error, "status"),
    details: pick(error, "details"),
    hint: pick(error, "hint"),
    localizedDescription: pick(error, "localizedDescription"),
    errorMessage: pick(error, "errorMessage"),
    keys: isObject ? Object.getOwnPropertyNames(error as object) : undefined,
  };
}
// ---------------------------------------------------------------------------

type CapacitorGlobal = {
  readonly isNativePlatform?: () => boolean;
  readonly getPlatform?: () => string;
};

function readCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only inside the native iOS app (not Safari, not the installed PWA). */
export function isNativeIosApp(capacitor: CapacitorGlobal | undefined = readCapacitor()): boolean {
  try {
    return Boolean(capacitor?.isNativePlatform?.()) && capacitor?.getPlatform?.() === "ios";
  } catch {
    return false;
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes as 64 hex characters. */
export function randomNonce(
  getRandomValues: (array: Uint8Array) => Uint8Array = (array) =>
    crypto.getRandomValues(array),
): string {
  return toHex(getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(
  text: string,
  digest: (data: Uint8Array) => Promise<ArrayBuffer> = (data) =>
    crypto.subtle.digest("SHA-256", data as BufferSource),
): Promise<string> {
  return toHex(new Uint8Array(await digest(new TextEncoder().encode(text))));
}

export interface NoncePair {
  /** Sent to Supabase together with the identity token. */
  readonly raw: string;
  /** Sent to Apple's sheet (what ends up in the token's `nonce` claim). */
  readonly hashed: string;
}

export async function createNoncePair(raw: string = randomNonce()): Promise<NoncePair> {
  return { raw, hashed: await sha256Hex(raw) };
}

export function composeAppleFullName(
  givenName: string | null | undefined,
  familyName: string | null | undefined,
): string | null {
  const full = [givenName, familyName]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return full || null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error ?? "");
}

/** ASAuthorizationError.canceled (1001) — the person closed the sheet; not an error. */
export function isAppleCancellation(error: unknown): boolean {
  return /\b1001\b|cancel/i.test(messageOf(error));
}

export function appleErrorMessage(error: unknown): string {
  const message = messageOf(error);
  if (/provider is not enabled/i.test(message)) {
    return "Login com a Apple ainda não está disponível.";
  }
  // ASAuthorizationError.unknown (1000): typically no iCloud account on the device.
  if (/\b1000\b/.test(message)) {
    return "Não foi possível entrar com a Apple. Verifique se você está conectado ao iCloud neste aparelho.";
  }
  return "Não foi possível entrar com a Apple. Tente novamente.";
}

export interface AppleAuthorizeOptions {
  readonly clientId: string;
  readonly redirectURI: string;
  readonly scopes?: string;
  readonly state?: string;
  readonly nonce?: string;
}

export interface AppleAuthorizeResult {
  readonly response: {
    readonly user: string | null;
    readonly email: string | null;
    readonly givenName: string | null;
    readonly familyName: string | null;
    readonly identityToken: string;
    readonly authorizationCode: string;
  };
}

/** The slice of the Supabase browser client this flow needs. */
export interface AppleSupabaseClient {
  readonly auth: {
    signInWithIdToken(credentials: {
      provider: "apple";
      token: string;
      nonce?: string;
    }): Promise<{
      data: {
        user: {
          id: string;
          user_metadata?: Record<string, unknown>;
        } | null;
      };
      error: { message: string } | null;
    }>;
    updateUser(attributes: {
      data: Record<string, unknown>;
    }): Promise<{ error: { message: string } | null }>;
  };
  from(table: "users"): {
    update(values: { display_name: string }): {
      eq(column: "id", value: string): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

export type AppleSignInResult =
  | { readonly status: "signed-in" }
  | { readonly status: "cancelled" }
  | { readonly status: "error"; readonly message: string };

export interface AppleSignInDeps {
  readonly authorize?: (options: AppleAuthorizeOptions) => Promise<AppleAuthorizeResult>;
  readonly createNonce?: () => Promise<NoncePair>;
}

async function authorizeWithPlugin(
  options: AppleAuthorizeOptions,
): Promise<AppleAuthorizeResult> {
  // Loaded on demand so the plugin (and its web fallback) never weighs on pages that don't use it.
  const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
  return SignInWithApple.authorize(options);
}

/**
 * Apple only sends the name on the very first authorization of an app, so it
 * has to be stored right away — otherwise the profile falls back to the
 * (often private-relay) e-mail. Best effort: never fails the sign-in.
 */
async function saveAppleName(
  supabase: AppleSupabaseClient,
  user: { id: string; user_metadata?: Record<string, unknown> },
  givenName: string | null,
  familyName: string | null,
): Promise<void> {
  const fullName = composeAppleFullName(givenName, familyName);
  if (!fullName) return;
  const existing = user.user_metadata?.full_name;
  if (typeof existing === "string" && existing.trim()) return;
  try {
    await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        ...(givenName?.trim() ? { given_name: givenName.trim() } : {}),
        ...(familyName?.trim() ? { family_name: familyName.trim() } : {}),
      },
    });
    await supabase.from("users").update({ display_name: fullName }).eq("id", user.id);
  } catch (error) {
    appleDebugLog("nome: falha ao salvar (ignorada, login segue)", describeError(error));
    // The account exists either way; the name can still be edited in the profile.
  }
}

export async function signInWithAppleNative(
  supabase: AppleSupabaseClient,
  deps: AppleSignInDeps = {},
): Promise<AppleSignInResult> {
  try {
    return await runSignInWithAppleNative(supabase, deps);
  } catch (error) {
    // TEMP-APPLE-DEBUG: log, then rethrow so behaviour is unchanged.
    appleDebugLog("8/9 EXCEÇÃO GERAL (relançada)", describeError(error));
    throw error;
  }
}

async function runSignInWithAppleNative(
  supabase: AppleSupabaseClient,
  deps: AppleSignInDeps,
): Promise<AppleSignInResult> {
  const authorize = deps.authorize ?? authorizeWithPlugin;
  const createNonce = deps.createNonce ?? createNoncePair;

  let authorization: AppleAuthorizeResult;
  let nonce: NoncePair;
  try {
    appleDebugLog("1/9 antes de gerar o nonce", {
      isSecureContext: typeof window !== "undefined" ? window.isSecureContext : undefined,
      hasCrypto: typeof crypto !== "undefined",
      hasCryptoSubtle: typeof crypto !== "undefined" && Boolean(crypto.subtle),
      hasCapacitor: Boolean(readCapacitor()),
      platform: readCapacitor()?.getPlatform?.(),
    });
    nonce = await createNonce();
    appleDebugLog("2/9 nonce gerado", {
      rawLength: nonce.raw.length,
      hashedLength: nonce.hashed.length,
      hashedIsHex64: /^[0-9a-f]{64}$/.test(nonce.hashed),
    });
    appleDebugLog("3/9 antes de chamar SignInWithApple.authorize()", {
      clientId: APPLE_NATIVE_CLIENT_ID,
      scopes: "email name",
      nonceSentToAppleLength: nonce.hashed.length,
    });
    authorization = await authorize({
      clientId: APPLE_NATIVE_CLIENT_ID,
      redirectURI: APPLE_UNUSED_REDIRECT_URI,
      scopes: "email name",
      nonce: nonce.hashed,
    });
    const response = authorization?.response;
    appleDebugLog("4/9 authorize() RETORNOU", {
      hasResponse: Boolean(response),
      identityTokenPresent: Boolean(response?.identityToken),
      identityTokenLength: response?.identityToken?.length ?? 0,
      authorizationCodePresent: Boolean(response?.authorizationCode),
      emailPresent: Boolean(response?.email),
      namePresent: Boolean(response?.givenName || response?.familyName),
      responseKeys: response ? Object.keys(response) : [],
    });
  } catch (error) {
    appleDebugLog("5/9 authorize()/nonce LANÇOU ERRO", {
      ...describeError(error),
      treatedAsCancellation: isAppleCancellation(error),
    });
    if (isAppleCancellation(error)) return { status: "cancelled" };
    return { status: "error", message: appleErrorMessage(error) };
  }

  const identityToken = authorization.response?.identityToken;
  if (!identityToken) {
    appleDebugLog("5b/9 SEM identityToken na resposta do plugin -> erro genérico");
    return { status: "error", message: appleErrorMessage(null) };
  }

  appleDebugLog("6/9 antes de supabase.auth.signInWithIdToken()", {
    provider: "apple",
    identityTokenLength: identityToken.length,
    rawNonceSent: Boolean(nonce.raw),
  });
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
    nonce: nonce.raw,
  });
  appleDebugLog(
    error || !data.user
      ? "7/9 signInWithIdToken() FALHOU"
      : "7/9 signInWithIdToken() OK",
    {
      hasError: Boolean(error),
      ...(error ? describeError(error) : {}),
      hasUser: Boolean(data?.user),
    },
  );
  if (error || !data.user) {
    return { status: "error", message: appleErrorMessage(error) };
  }

  await saveAppleName(
    supabase,
    data.user,
    authorization.response.givenName,
    authorization.response.familyName,
  );
  appleDebugLog("8/9 login Apple concluído (aguardando sessão -> redirect /perfil)");
  return { status: "signed-in" };
}

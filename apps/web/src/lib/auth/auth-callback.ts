/**
 * Decision logic of the /auth/callback route, kept free of Next.js so it can be tested.
 *
 * Both the browser redirect flow and the apps (iOS sheet / Android Custom Tab, which hand the one-time code to
 * this route through the web view) end here: the code is exchanged with the PKCE verifier that the same web
 * view stored in its cookies, and the session cookies are written by the server client.
 *
 * Diagnostics never include the code, tokens or cookie values: only whether the verifier cookie was present and
 * the error's short code.
 */

/** Where OAuth can send the browser back to (an allowlist, never "any relative path": no open redirect). */
export const ALLOWED_NEXT_PATHS: ReadonlySet<string> = new Set(["/login", "/ativar"]);

export type AuthCallbackFailure =
  | "missing_code"
  | "supabase_not_configured"
  | "auth_callback_failed";

/** Why an exchange failed, for the login screen and the logs. Never carries secrets. */
export type AuthCallbackReason = "no_verifier" | "exchange_failed";

export interface AuthCallbackClient {
  readonly auth: {
    exchangeCodeForSession(code: string): Promise<{ error: { code?: string; status?: number } | null }>;
    getUser(): Promise<{ data: { user: { id: string } | null } }>;
  };
}

export interface AuthCallbackDeps {
  readonly createClient: () => Promise<AuthCallbackClient | null>;
  /** True when the request carried the PKCE `…-code-verifier` cookie. */
  readonly hasVerifierCookie: boolean;
  readonly warn?: (message: string) => void;
}

export async function resolveAuthCallback(requestUrl: string, deps: AuthCallbackDeps): Promise<URL> {
  const url = new URL(requestUrl);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const hasNext = Boolean(nextParam && ALLOWED_NEXT_PATHS.has(nextParam));
  const failure = new URL(hasNext ? (nextParam as string) : "/login", url.origin);
  const warn = deps.warn ?? (() => undefined);

  if (!code) {
    failure.searchParams.set("error", "missing_code" satisfies AuthCallbackFailure);
    return failure;
  }

  const client = await deps.createClient();
  if (!client) {
    failure.searchParams.set("error", "supabase_not_configured" satisfies AuthCallbackFailure);
    return failure;
  }

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    // The same code can arrive twice (the system re-delivering the link, a double navigation). The first exchange
    // already created the session, and a code is single-use, so the second fails: if a person is signed in, the
    // login did succeed.
    const { data } = await client.auth.getUser();
    if (!data.user) {
      const reason: AuthCallbackReason = deps.hasVerifierCookie ? "exchange_failed" : "no_verifier";
      warn(
        `[auth/callback] code exchange failed: reason=${reason}, errorCode=${error.code ?? "unknown"}, status=${error.status ?? "unknown"}`,
      );
      failure.searchParams.set("error", "auth_callback_failed" satisfies AuthCallbackFailure);
      failure.searchParams.set("reason", reason);
      return failure;
    }
    warn("[auth/callback] code already used, session already present: treated as success");
  }

  // A plain login (no explicit `next`) goes straight to the profile instead of bouncing through /login first.
  return hasNext ? new URL(nextParam as string, url.origin) : new URL("/perfil", url.origin);
}

/** Friendly text for `/login?error=…`, so a failed login is never silent. Null = nothing to show. */
export function loginErrorMessage(search: string): string | null {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  if (!error) return null;
  if (error === "auth_callback_failed") {
    return params.get("reason") === "no_verifier"
      ? "Não foi possível concluir o login: a sessão de acesso foi perdida enquanto você estava no navegador. Tente entrar novamente."
      : "Não foi possível concluir o login. Tente entrar novamente.";
  }
  if (error === "missing_code") return "O login não foi concluído. Tente entrar novamente.";
  if (error === "supabase_not_configured") return "O acesso não está configurado neste ambiente.";
  return null;
}

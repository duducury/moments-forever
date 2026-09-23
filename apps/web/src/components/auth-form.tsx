"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { OAuthButtons } from "@/components/oauth-buttons";

import { AppBootSplash } from "./app-boot-splash";
import { useAuth } from "./auth-provider";
import { signalPwaBootReady } from "./pwa-splash-dismiss";

type Mode = "sign-in" | "sign-up";

/**
 * Supabase's own error text can reveal whether an email is registered
 * ("Invalid login credentials" vs "User already registered"-shaped errors)
 * — normalize the ones that matter for account enumeration to a generic
 * message. Everything else (weak password, invalid email, rate limit) is
 * left as-is since it doesn't leak account existence and the user needs it
 * to fix their input.
 */
function authErrorMessage(
  mode: Mode,
  error: { readonly code?: string; readonly message: string },
): string {
  if (mode === "sign-in") {
    if (error.code === "invalid_credentials" || error.code === "user_not_found") {
      return "Email ou senha inválidos.";
    }
    return error.message;
  }
  if (error.code === "user_already_exists" || error.code === "email_exists") {
    return "Conta criada. Verifique seu e-mail, se solicitado.";
  }
  return error.message;
}

export function AuthForm() {
  const router = useRouter();
  const { session, loading: authLoading, configured } = useAuth();
  const client = createSupabaseBrowserClient();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && session) {
      router.replace("/perfil");
    }
  }, [authLoading, session, router]);

  useEffect(() => {
    if (!configured || (!authLoading && !session)) {
      signalPwaBootReady();
    }
  }, [authLoading, configured, session]);

  if (!client) {
    return (
      <div className="notice" role="status">
        Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para
        habilitar a autenticação.
      </div>
    );
  }

  if (authLoading || session) {
    return (
      <AppBootSplash
        hint={session ? "Entrando na sua coleção…" : "Abrindo o acesso…"}
        overlay
      />
    );
  }

  const authClient = client;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const result =
      mode === "sign-in"
        ? await authClient.auth.signInWithPassword({ email, password })
        : await authClient.auth.signUp({ email, password });

    if (result.error) {
      setMessage(authErrorMessage(mode, result.error));
      setBusy(false);
      return;
    }

    if (result.data.session) {
      setMessage("Sessão iniciada.");
      router.replace("/perfil");
      return;
    }

    setMessage(
      mode === "sign-up"
        ? "Conta criada. Verifique seu e-mail, se solicitado."
        : "Sessão iniciada.",
    );
    setBusy(false);
  }

  async function handleOAuth(provider: "google" | "facebook") {
    setBusy(true);
    setMessage(null);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await authClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      // Supabase's own message here ("Unsupported provider: provider is not
      // enabled") is meant for the developer, not the end user — it means
      // this provider isn't turned on in the Supabase dashboard yet.
      setMessage(
        error.message.includes("provider is not enabled")
          ? "Login com esse provedor ainda não está disponível."
          : error.message,
      );
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="segmented" aria-label="Tipo de acesso">
        <button
          className={mode === "sign-in" ? "active" : ""}
          onClick={() => setMode("sign-in")}
          type="button"
        >
          Entrar
        </button>
        <button
          className={mode === "sign-up" ? "active" : ""}
          onClick={() => setMode("sign-up")}
          type="button"
        >
          Criar conta
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
        <button className="button primary" disabled={busy} type="submit">
          {busy ? "Aguarde…" : mode === "sign-in" ? "Entrar" : "Criar conta"}
        </button>
      </form>
      <div className="divider"><span>ou</span></div>
      <OAuthButtons busy={busy} onSelect={(provider) => void handleOAuth(provider)} />
      {message ? <p className="form-message" role="status">{message}</p> : null}
    </div>
  );
}

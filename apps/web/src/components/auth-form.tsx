"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { AppBootSplash } from "./app-boot-splash";
import { useAuth } from "./auth-provider";

type Mode = "sign-in" | "sign-up";

export function AuthForm() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const client = createSupabaseBrowserClient();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && session) {
      router.replace("/perfil");
    }
  }, [authLoading, session, router]);

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
      setMessage(result.error.message);
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

  async function handleApple() {
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await authClient.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo },
    });
    if (error) {
      setMessage(error.message);
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
      <button className="button secondary" disabled={busy} onClick={handleApple}>
        Continuar com Apple
      </button>
      {message ? <p className="form-message" role="status">{message}</p> : null}
    </div>
  );
}

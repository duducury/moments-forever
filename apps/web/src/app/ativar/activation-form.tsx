"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AppBootSplash } from "@/components/app-boot-splash";
import { useAuth } from "@/components/auth-provider";
import { signalPwaBootReady } from "@/components/pwa-splash-dismiss";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import styles from "./ativar.module.css";

type Mode = "sign-up" | "sign-in";

interface ActivatedResult {
  readonly planName: string;
  /** Running total across every code the account has redeemed — codes stack. */
  readonly totalNfcTags: number;
}

/**
 * OAuth sign-up leaves the page entirely (Apple/Google/Facebook), so the
 * typed code can't just live in React state across that redirect — it has
 * to survive in sessionStorage until /auth/callback brings the user back.
 */
const PENDING_CODE_KEY = "mf-pending-activation-code";

function formatCodeInput(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutPrefix = cleaned.startsWith("MF") ? cleaned.slice(2) : cleaned;
  const groups = [
    withoutPrefix.slice(0, 4),
    withoutPrefix.slice(4, 8),
    withoutPrefix.slice(8, 10),
  ].filter(Boolean);
  return groups.length > 0 ? `MF-${groups.join("-")}` : "";
}

export function ActivationForm() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const client = createSupabaseBrowserClient();
  const [mode, setMode] = useState<Mode>("sign-up");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activated, setActivated] = useState<ActivatedResult | null>(null);
  const redeemedPendingRef = useRef(false);

  useEffect(() => {
    if (!session || redeemedPendingRef.current) return;
    const pending = sessionStorage.getItem(PENDING_CODE_KEY);
    if (!pending) return;
    redeemedPendingRef.current = true;

    async function run() {
      setCode(pending!);
      setBusy(true);
      sessionStorage.removeItem(PENDING_CODE_KEY);
      try {
        await redeemCode(pending!);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível ativar sua conta agora.",
        );
      } finally {
        setBusy(false);
      }
    }
    void run();
  }, [session]);

  if (!client) {
    return (
      <div className="notice" role="status">
        Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para
        habilitar a ativação.
      </div>
    );
  }

  if (authLoading) {
    signalPwaBootReady();
    return <AppBootSplash hint="Abrindo a ativação…" overlay />;
  }

  const authClient = client;

  async function redeemCode(codeToRedeem: string): Promise<void> {
    const response = await fetch("/api/activation/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codeToRedeem }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      plan?: { name: string; maxNfcTags: number };
      total?: { maxNfcTags: number } | null;
    };
    if (!response.ok || !data.plan) {
      throw new Error(data.error ?? "Não foi possível ativar sua conta agora.");
    }
    setActivated({
      planName: data.plan.name,
      totalNfcTags: data.total?.maxNfcTags ?? data.plan.maxNfcTags,
    });
  }

  async function handleOAuth(provider: "apple" | "google" | "facebook") {
    const trimmedCode = code.trim().toUpperCase();
    if (!/^MF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(trimmedCode)) {
      setMessage("Digite o código no formato MF-XXXX-XXXX-XX.");
      return;
    }
    setBusy(true);
    setMessage(null);
    sessionStorage.setItem(PENDING_CODE_KEY, trimmedCode);
    const redirectTo = `${window.location.origin}/auth/callback?next=/ativar`;
    const { error } = await authClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      sessionStorage.removeItem(PENDING_CODE_KEY);
      setMessage(
        error.message.includes("provider is not enabled")
          ? "Login com esse provedor ainda não está disponível."
          : error.message,
      );
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const trimmedCode = code.trim().toUpperCase();
    if (!/^MF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(trimmedCode)) {
      setMessage("Digite o código no formato MF-XXXX-XXXX-XX.");
      setBusy(false);
      return;
    }

    try {
      if (session) {
        await redeemCode(trimmedCode);
        setBusy(false);
        return;
      }

      const data = new FormData(event.currentTarget);
      const email = String(data.get("email") ?? "");
      const password = String(data.get("password") ?? "");
      const result =
        mode === "sign-up"
          ? await authClient.auth.signUp({ email, password })
          : await authClient.auth.signInWithPassword({ email, password });

      if (result.error) {
        setMessage(result.error.message);
        setBusy(false);
        return;
      }
      if (!result.data.session) {
        setMessage(
          "Verifique seu e-mail para confirmar a conta e depois volte para ativar.",
        );
        setBusy(false);
        return;
      }

      await redeemCode(trimmedCode);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível ativar sua conta agora.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (activated) {
    return (
      <div className="auth-card">
        <p className="eyebrow">✅ Código ativado com sucesso</p>
        <h1>
          {session
            ? "Código ativado com sucesso!"
            : "Seu Moments Forever está ativado."}
        </h1>
        <p className={styles.successStat}>
          Plano {activated.planName} adicionado. Você tem{" "}
          {activated.totalNfcTags} tag
          {activated.totalNfcTags === 1 ? "" : "s"} NFC no total.
        </p>
        <button
          className="button primary"
          onClick={() => router.replace(session ? "/geral" : "/perfil")}
          type="button"
        >
          {session ? "Voltar" : "Começar minha jornada"}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-card">
      {!session ? (
        <div className="segmented" aria-label="Tipo de acesso">
          <button
            className={mode === "sign-up" ? "active" : ""}
            onClick={() => setMode("sign-up")}
            type="button"
          >
            Criar conta
          </button>
          <button
            className={mode === "sign-in" ? "active" : ""}
            onClick={() => setMode("sign-in")}
            type="button"
          >
            Já tenho conta
          </button>
        </div>
      ) : null}
      <form onSubmit={handleSubmit}>
        <label htmlFor="code">Código de ativação</label>
        <input
          className={styles.codeInput}
          id="code"
          name="code"
          onChange={(event) => setCode(formatCodeInput(event.target.value))}
          placeholder="MF-____-____-__"
          required
          value={code}
        />
        {!session ? (
          <>
            <label htmlFor="email">E-mail</label>
            <input
              autoComplete="email"
              id="email"
              name="email"
              required
              type="email"
            />
            <label htmlFor="password">Senha</label>
            <input
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              id="password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </>
        ) : null}
        <button className="button primary" disabled={busy} type="submit">
          {busy ? "Ativando…" : "Ativar"}
        </button>
      </form>
      {!session ? (
        <>
          <div className="divider">
            <span>ou</span>
          </div>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void handleOAuth("apple")}
            type="button"
          >
            Continuar com Apple
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void handleOAuth("google")}
            type="button"
          >
            Continuar com Google
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void handleOAuth("facebook")}
            type="button"
          >
            Continuar com Facebook
          </button>
        </>
      ) : null}
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}

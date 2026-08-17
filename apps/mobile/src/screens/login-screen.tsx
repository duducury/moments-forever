import { colors, radii, spacing } from "@moments-forever/config";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getSupabase } from "../lib/supabase";
import { Button, Screen, typography } from "../ui";

WebBrowser.maybeCompleteAuthSession();

type Mode = "sign-in" | "sign-up";

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supabase = getSupabase();

  if (!supabase) {
    return (
      <Screen>
        <Text style={typography.eyebrow}>Autenticação</Text>
        <Text style={typography.title}>Quase pronto.</Text>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Configure EXPO_PUBLIC_SUPABASE_URL e
            EXPO_PUBLIC_SUPABASE_ANON_KEY para habilitar o acesso.
          </Text>
        </View>
      </Screen>
    );
  }

  async function submit() {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setMessage(
      result.error
        ? result.error.message
        : mode === "sign-in"
          ? "Sessão iniciada."
          : "Conta criada. Verifique seu e-mail, se solicitado.",
    );
    setBusy(false);
  }

  async function continueWithApple() {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const redirectTo = Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error || !data.url) {
      setMessage(error?.message ?? "Não foi possível iniciar o acesso com Apple.");
      setBusy(false);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "success") {
      const code = new URL(result.url).searchParams.get("code");
      if (code) {
        const exchange = await supabase.auth.exchangeCodeForSession(code);
        setMessage(exchange.error?.message ?? "Sessão iniciada.");
      }
    }
    setBusy(false);
  }

  return (
    <Screen>
      <Text style={typography.eyebrow}>Sua coleção privada</Text>
      <Text style={typography.title}>Guarde o que importa.</Text>
      <View style={styles.card}>
        <View style={styles.tabs}>
          <Button secondary={mode !== "sign-in"} onPress={() => setMode("sign-in")}>
            Entrar
          </Button>
          <Button secondary={mode !== "sign-up"} onPress={() => setMode("sign-up")}>
            Criar conta
          </Button>
        </View>
        <Text style={styles.label}>E-mail</Text>
        <TextInput
          accessibilityLabel="E-mail"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          style={styles.input}
          value={email}
        />
        <Text style={styles.label}>Senha</Text>
        <TextInput
          accessibilityLabel="Senha"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <View style={styles.submit}>
          <Button disabled={busy} onPress={() => void submit()}>
            {busy ? "Aguarde…" : mode === "sign-in" ? "Entrar" : "Criar conta"}
          </Button>
        </View>
        <View style={styles.apple}>
          <Button secondary disabled={busy} onPress={() => void continueWithApple()}>
            Continuar com Apple
          </Button>
        </View>
        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
        {Platform.OS !== "ios" ? (
          <Text style={styles.helper}>
            O acesso com Apple depende da configuração do provedor no Supabase.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  label: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  submit: {
    marginTop: spacing.lg,
  },
  apple: {
    marginTop: spacing.sm,
  },
  message: {
    marginTop: spacing.md,
    color: colors.muted,
    lineHeight: 21,
  },
  helper: {
    marginTop: spacing.sm,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  notice: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  noticeText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 25,
  },
});

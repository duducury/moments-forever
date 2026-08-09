import { colors, radii, spacing } from "@moments-forever/config";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "../auth/auth-provider";
import { Button, Screen, typography } from "../ui";

export function SettingsScreen() {
  const { configured, user, signOut } = useAuth();

  return (
    <Screen>
      <Text style={typography.eyebrow}>Ajustes</Text>
      <Text style={typography.title}>Sua conta.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Sessão</Text>
        <Text style={styles.value}>
          {!configured
            ? "Supabase ainda não configurado"
            : user?.email ?? "Nenhuma conta conectada"}
        </Text>
      </View>
      {user ? <Button onPress={() => void signOut()}>Sair da conta</Button> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  value: {
    marginTop: spacing.sm,
    color: colors.ink,
    fontSize: 17,
  },
});

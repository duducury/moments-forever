import { colors, radii, spacing } from "@moments-forever/config";
import { StyleSheet, Text, View } from "react-native";

import { Screen, typography } from "../ui";

export function CreateMemoryScreen() {
  return (
    <Screen>
      <Text style={typography.eyebrow}>Nova memória</Text>
      <Text style={typography.title}>Comece com uma história.</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Criação disponível em breve</Text>
        <Text style={styles.body}>
          Esta etapa prepara apenas a navegação. Nenhuma foto será selecionada,
          processada ou enviada.
        </Text>
        <Text style={styles.private}>Privada por padrão</Text>
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
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  title: {
    color: colors.ink,
    fontFamily: "serif",
    fontSize: 28,
  },
  body: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 25,
  },
  private: {
    alignSelf: "flex-start",
    marginTop: spacing.lg,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.accent,
    backgroundColor: colors.paper,
    fontSize: 13,
    fontWeight: "700",
  },
});

import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, radii, spacing } from "@moments-forever/config";
import { StyleSheet, Text, View } from "react-native";

import type { RootStackParamList } from "../navigation";
import { Button, Screen, typography } from "../ui";

type Props = NativeStackScreenProps<RootStackParamList, "Collection">;

export function CollectionScreen({ navigation }: Props) {
  return (
    <Screen>
      <Text style={typography.eyebrow}>Minha coleção</Text>
      <Text style={typography.title}>Memórias que ficam.</Text>
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Sua coleção está vazia</Text>
        <Text style={styles.emptyText}>
          Quando você criar uma memória, ela começará privada e aparecerá aqui.
        </Text>
      </View>
      <Button onPress={() => navigation.navigate("CreateMemory")}>
        Criar primeira memória
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    minHeight: 280,
    justifyContent: "center",
    marginVertical: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  emptyTitle: {
    color: colors.ink,
    fontFamily: "serif",
    fontSize: 28,
  },
  emptyText: {
    marginTop: spacing.sm,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
});

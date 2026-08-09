import { colors, radii, spacing } from "@moments-forever/config";
import type { ReactNode } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  type PressableProps,
} from "react-native";

export function Screen({ children }: { readonly children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView>
    </SafeAreaView>
  );
}

interface ButtonProps extends PressableProps {
  readonly children: ReactNode;
  readonly secondary?: boolean;
}

export function Button({ children, secondary, ...props }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
        {children}
      </Text>
    </Pressable>
  );
}

export const typography = StyleSheet.create({
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    marginTop: spacing.md,
    color: colors.ink,
    fontFamily: "serif",
    fontSize: 46,
    fontWeight: "500",
    letterSpacing: -1.8,
    lineHeight: 50,
  },
  body: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 17,
    lineHeight: 27,
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  screen: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  button: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  pressed: {
    opacity: 0.72,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButtonText: {
    color: colors.ink,
  },
});

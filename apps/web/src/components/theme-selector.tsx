"use client";

import { toggleThemePreference } from "@/lib/theme/theme";

import { useTheme } from "./theme-provider";

export function ThemeSelector() {
  const { preference, setPreference } = useTheme();
  const next = toggleThemePreference(preference);
  const label =
    next === "dark" ? "Ativar tema escuro" : "Ativar tema claro";
  const isLight = preference === "light";
  const icon = isLight ? "🌙" : "☀️";

  return (
    <button
      aria-label={label}
      className="theme-toggle"
      onClick={() => setPreference(next)}
      title={label}
      type="button"
    >
      <span
        aria-hidden="true"
        className={isLight ? "theme-toggle-moon" : undefined}
      >
        {icon}
      </span>
    </button>
  );
}

export type ThemePreference = "light" | "dark";
export type ResolvedTheme = ThemePreference;

export const THEME_STORAGE_KEY = "mf-theme";
export const THEME_CHANGE_EVENT = "mf-theme-change";
export const DEFAULT_THEME: ThemePreference = "light";

export function isThemePreference(
  value: string | null | undefined,
): value is ThemePreference {
  return value === "light" || value === "dark";
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference;
}

export function applyThemeToDocument(
  preference: ThemePreference,
  resolved: ResolvedTheme = resolveTheme(preference),
) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = preference;
  document.documentElement.dataset.resolvedTheme = resolved;
}

export function persistThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyThemeToDocument(preference);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function toggleThemePreference(
  preference: ThemePreference,
): ThemePreference {
  return preference === "light" ? "dark" : "light";
}

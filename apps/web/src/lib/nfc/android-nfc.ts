/**
 * Android-only NFC rules for the native shell, kept apart from native-nfc.ts so they can be unit tested.
 *
 * The app declares NFC as an OPTIONAL feature (`uses-feature android.hardware.nfc required=false`) so phones
 * without NFC can install it, and Android can have NFC switched off in settings. The plugin's `writeNDEF`
 * resolves right away even then and the person would wait for a tag forever, so the status is checked first.
 * Android also reads tags passively (foreground dispatch): there is no scan session to start.
 */

export type NfcHardwareStatus = "ENABLED" | "DISABLED" | "NOT_SUPPORTED";

/** The message to show instead of waiting for a tag, or null when NFC can be used. */
export function nfcUnavailableMessage(status: NfcHardwareStatus | undefined): string | null {
  if (status === "NOT_SUPPORTED") return "Este aparelho não tem NFC.";
  if (status === "DISABLED") return "O NFC está desligado. Ative-o nas configurações do aparelho e tente de novo.";
  return null;
}

/** Capacitor platform name of the running shell ("ios" | "android" | "web"), "web" outside the app. */
export function nativePlatform(): string {
  if (typeof window === "undefined") return "web";
  try {
    const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return capacitor?.getPlatform?.() ?? "web";
  } catch {
    return "web";
  }
}

/** Android has no scan session: the plugin rejects `startScan` there and always listens for tags. */
export function needsStartScan(platform: string): boolean {
  return platform !== "android";
}

import { isWebNfcSupported, writeUrlToNfcTag } from "@/lib/nfc/web-nfc";

/**
 * Bridges to `@exxili/capacitor-nfc` only when running inside the native
 * Capacitor shell (the iOS/Android app, not the plain website) — this
 * package touches Core NFC / Android's NFC APIs, which don't exist in a
 * browser, so it must never be imported at the top level here.
 */
async function loadNativeNfcModule(): Promise<
  typeof import("@exxili/capacitor-nfc") | null
> {
  try {
    return await import("@exxili/capacitor-nfc");
  } catch {
    return null;
  }
}

function isRunningInNativeShell(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor?.isNativePlatform?.(),
    )
  );
}

/** True when this build can write NFC tags without leaving the app (native shell or Web NFC). */
export function isNativeNfcSupported(): boolean {
  return isRunningInNativeShell();
}

/**
 * Writes `url` to a physical NFC tag using whichever mechanism is available:
 * the native Core NFC / Android NFC bridge inside the iOS/Android app shell,
 * or the browser's Web NFC API (Chrome for Android) on the plain website.
 * Rejects with a friendly message when neither is available — callers should
 * feature-detect with {@link isNativeNfcSupported} / `isWebNfcSupported`
 * first and only show the "gravar" button when one of them is true.
 */
export async function writeUrlToNfcTagAuto(url: string): Promise<void> {
  if (isRunningInNativeShell()) {
    const nfc = await loadNativeNfcModule();
    if (!nfc) {
      throw new Error("Módulo de NFC nativo indisponível neste build.");
    }
    await new Promise<void>((resolve, reject) => {
      const removeError = nfc.NFC.onError((error) => {
        removeWrite();
        removeError();
        void nfc.NFC.cancelScan();
        reject(new Error(error.error || "Falha ao gravar a tag NFC."));
      });
      const removeWrite = nfc.NFC.onWrite(() => {
        removeWrite();
        removeError();
        void nfc.NFC.cancelScan();
        resolve();
      });
      // iOS needs an active scan session before it can present the "hold
      // near tag" sheet; Android is always listening, so this is a no-op.
      nfc.NFC.startScan()
        .then(() =>
          nfc.NFC.writeNDEF({
            records: [{ type: "U", payload: url }],
          }),
        )
        .catch((error: unknown) => {
          removeWrite();
          removeError();
          reject(
            error instanceof Error
              ? error
              : new Error("Falha ao gravar a tag NFC."),
          );
        });
    });
    return;
  }

  if (isWebNfcSupported()) {
    await writeUrlToNfcTag(url);
    return;
  }

  throw new Error("Este dispositivo não tem suporte à gravação de tags NFC.");
}

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
  const result = isRunningInNativeShell();
  console.log(
    "[nfc-native] isNativeNfcSupported():",
    result,
    "— window.Capacitor present:",
    typeof window !== "undefined" &&
      Boolean((window as unknown as { Capacitor?: unknown }).Capacitor),
  );
  return result;
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
    console.log("[nfc-native] native shell detected, loading @exxili/capacitor-nfc…");
    const nfc = await loadNativeNfcModule();
    if (!nfc) {
      console.error(
        "[nfc-native] failed to import @exxili/capacitor-nfc — plugin not linked into the Xcode/Android project.",
      );
      throw new Error("Módulo de NFC nativo indisponível neste build.");
    }
    console.log("[nfc-native] plugin loaded, calling NFC.writeNDEF()…", url);
    // `writeNDEF` opens its own Core NFC session (NFCWriter.swift) — it must
    // NOT be preceded by `startScan()` (that starts a *second*, competing
    // session via NFCReader.swift; iOS only allows one active reader session
    // per app and the write would fail or never prompt).
    await new Promise<void>((resolve, reject) => {
      const removeError = nfc.NFC.onError((error) => {
        console.error("[nfc-native] write error:", error);
        removeWrite();
        removeError();
        reject(new Error(error.error || "Falha ao gravar a tag NFC."));
      });
      const removeWrite = nfc.NFC.onWrite(() => {
        console.log("[nfc-native] write success");
        removeWrite();
        removeError();
        resolve();
      });
      nfc.NFC.writeNDEF({
        records: [{ type: "U", payload: url }],
      }).catch((error: unknown) => {
        console.error("[nfc-native] writeNDEF() call itself rejected:", error);
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
    console.log("[nfc-native] not a native shell — using Web NFC (NDEFReader)");
    await writeUrlToNfcTag(url);
    return;
  }

  console.warn(
    "[nfc-native] neither native shell nor Web NFC detected — window.Capacitor:",
    typeof window !== "undefined"
      ? (window as unknown as { Capacitor?: unknown }).Capacitor
      : "no window",
  );
  throw new Error("Este dispositivo não tem suporte à gravação de tags NFC.");
}

export interface NativeNfcReadResult {
  /** First "U" (URI) record's decoded text, if the tag has one. */
  readonly url: string | null;
  /** Every record read off the tag, decoded as text, in order. */
  readonly records: readonly { readonly type: string; readonly payload: string }[];
}

/**
 * Reads whatever NDEF message is on the next tag the user taps, using the
 * native Core NFC / Android NFC bridge. Only meaningful inside the native
 * shell — Web NFC's `NDEFReader` also supports scanning, but nothing in this
 * app currently needs a browser read path, so this stays native-only.
 * Forces "ndef" reader mode so iOS uses the plain `NFCNDEFReaderSession`
 * (only needs the standard NFC Tag Reading capability) instead of the
 * plugin's advanced tag-session mode, which needs a separate Apple
 * entitlement grant this app doesn't have.
 */
export async function readNfcTag(): Promise<NativeNfcReadResult> {
  if (!isRunningInNativeShell()) {
    throw new Error("Leitura de NFC só funciona dentro do app.");
  }
  console.log("[nfc-native] native shell detected, loading @exxili/capacitor-nfc for read…");
  const nfc = await loadNativeNfcModule();
  if (!nfc) {
    console.error(
      "[nfc-native] failed to import @exxili/capacitor-nfc — plugin not linked into the Xcode/Android project.",
    );
    throw new Error("Módulo de NFC nativo indisponível neste build.");
  }
  console.log("[nfc-native] plugin loaded, calling NFC.startScan({ mode: 'ndef' })…");

  return new Promise<NativeNfcReadResult>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      removeRead();
      removeError();
    };
    const removeRead = nfc.NFC.onRead((data) => {
      if (settled) return;
      settled = true;
      cleanup();
      void nfc.NFC.cancelScan();
      const { messages } = data.string();
      const records = (messages[0]?.records ?? []).map((record) => ({
        type: record.type,
        payload: String(record.payload),
      }));
      const uriRecord = records.find((record) => record.type === "U");
      console.log("[nfc-native] read success, records:", records);
      resolve({ url: uriRecord?.payload ?? null, records });
    });
    const removeError = nfc.NFC.onError((error) => {
      if (settled) return;
      settled = true;
      cleanup();
      void nfc.NFC.cancelScan();
      console.error("[nfc-native] read error:", error);
      reject(new Error(error.error || "Falha ao ler a tag NFC."));
    });
    nfc.NFC.startScan({ mode: "ndef" }).catch((error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      console.error("[nfc-native] startScan() call itself rejected:", error);
      reject(
        error instanceof Error ? error : new Error("Falha ao ler a tag NFC."),
      );
    });
  });
}

/** Cancels an in-progress {@link readNfcTag} scan (e.g. user tapped "Cancelar"). */
export async function cancelNfcRead(): Promise<void> {
  if (!isRunningInNativeShell()) return;
  const nfc = await loadNativeNfcModule();
  if (!nfc) return;
  await nfc.NFC.cancelScan();
}

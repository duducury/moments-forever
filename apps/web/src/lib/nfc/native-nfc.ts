import {
  nativePlatform,
  needsStartScan,
  nfcUnavailableMessage,
  type NfcHardwareStatus,
} from "@/lib/nfc/android-nfc";
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

/** The person (or the screen closing) gave up on a write that was waiting for a tag. */
export class NfcWriteCancelledError extends Error {
  constructor() {
    super("Gravação cancelada.");
    this.name = "NfcWriteCancelledError";
  }
}

/** The slice of `@exxili/capacitor-nfc` a write needs (structural, so it can be faked in tests). */
export interface NativeNfcWriter {
  readonly NFC: {
    getStatus(): Promise<{ status: NfcHardwareStatus }>;
    writeNDEF(options: { records: { type: string; payload: string }[] }): Promise<unknown>;
    onWrite(listener: () => void): () => void;
    onError(listener: (error: { error: string }) => void): () => void;
    cancelWriteAndroid(): Promise<unknown>;
  };
}

/**
 * One write over the native plugin. It settles ONLY when the plugin says so: resolved by the plugin's
 * "write success" event (never when the call merely starts waiting for a tag), rejected by its error
 * event, or rejected with {@link NfcWriteCancelledError} when `signal` aborts (on Android the pending write
 * is also cancelled in the plugin, otherwise the next tag the phone touches would be overwritten).
 */
export async function performNativeWrite(
  nfc: NativeNfcWriter,
  url: string,
  options: { readonly platform: string; readonly signal?: AbortSignal },
): Promise<void> {
  const { platform, signal } = options;
  if (signal?.aborted) throw new NfcWriteCancelledError();
  if (platform === "android") {
    // NFC is an optional feature on Android: never wait for a tag on a phone without NFC / with NFC off.
    const { status } = await nfc.NFC.getStatus();
    const problem = nfcUnavailableMessage(status);
    if (problem) throw new Error(problem);
    if (signal?.aborted) throw new NfcWriteCancelledError();
  }
  console.log("[nfc-native] plugin loaded, calling NFC.writeNDEF()…", url);
  // `writeNDEF` opens its own Core NFC session (NFCWriter.swift) — it must
  // NOT be preceded by `startScan()` (that starts a *second*, competing
  // session via NFCReader.swift; iOS only allows one active reader session
  // per app and the write would fail or never prompt).
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let removeWrite: () => void = () => undefined;
    let removeError: () => void = () => undefined;
    const finish = (settle: () => void) => {
      if (finished) return;
      finished = true;
      removeWrite();
      removeError();
      signal?.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = () => {
      finish(() => reject(new NfcWriteCancelledError()));
      if (platform === "android") void nfc.NFC.cancelWriteAndroid().catch(() => undefined);
    };
    removeError = nfc.NFC.onError((error) => {
      console.error("[nfc-native] write error:", error);
      finish(() => reject(new Error(error.error || "Falha ao gravar a tag NFC.")));
    });
    removeWrite = nfc.NFC.onWrite(() => {
      console.log("[nfc-native] write success");
      finish(resolve);
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    nfc.NFC.writeNDEF({ records: [{ type: "U", payload: url }] }).catch((error: unknown) => {
      console.error("[nfc-native] writeNDEF() call itself rejected:", error);
      finish(() =>
        reject(error instanceof Error ? error : new Error("Falha ao gravar a tag NFC.")),
      );
    });
  });
}

/**
 * Writes `url` to a physical NFC tag using whichever mechanism is available:
 * the native Core NFC / Android NFC bridge inside the iOS/Android app shell,
 * or the browser's Web NFC API (Chrome for Android) on the plain website.
 * Rejects with a friendly message when neither is available — callers should
 * feature-detect with {@link isNativeNfcSupported} / `isWebNfcSupported`
 * first and only show the "gravar" button when one of them is true.
 * `options.signal` cancels a native write that is still waiting for a tag.
 */
export async function writeUrlToNfcTagAuto(
  url: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<void> {
  if (isRunningInNativeShell()) {
    console.log("[nfc-native] native shell detected, loading @exxili/capacitor-nfc…");
    const nfc = await loadNativeNfcModule();
    if (!nfc) {
      console.error(
        "[nfc-native] failed to import @exxili/capacitor-nfc — plugin not linked into the Xcode/Android project.",
      );
      throw new Error("Módulo de NFC nativo indisponível neste build.");
    }
    await performNativeWrite(nfc, url, { platform: nativePlatform(), signal: options.signal });
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
 * Uses "full" reader mode so iOS uses `NFCTagReaderSession` — the entitlement
 * (`com.apple.developer.nfc.readersession.formats`) only lists `TAG`, which
 * Apple's App Store Connect validation now requires (it rejects `NDEF` in
 * that entitlement outright). `NFCNDEFReaderSession` needs `NDEF` in that
 * same entitlement, so it's not usable here — see the patched
 * NFCReader.swift/NFCWriter.swift (via fix-capacitor-nfc-plugin.mjs) for how
 * NDEF read/write still work under a TAG-only session.
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
  if (nativePlatform() === "android") {
    const { status } = await nfc.NFC.getStatus();
    const problem = nfcUnavailableMessage(status);
    if (problem) throw new Error(problem);
  }
  console.log("[nfc-native] plugin loaded, calling NFC.startScan({ mode: 'full' })…");

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
    // Android always listens for tags (onRead above is enough); its plugin rejects startScan.
    if (!needsStartScan(nativePlatform())) return;
    nfc.NFC.startScan({ mode: "full" }).catch((error: unknown) => {
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

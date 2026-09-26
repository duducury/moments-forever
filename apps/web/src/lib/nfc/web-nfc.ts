/**
 * Web NFC (https://w3c.github.io/web-nfc/) — writes a URL straight onto a
 * blank physical NFC tag from the browser, no companion app needed.
 *
 * Only implemented in Chrome for Android over HTTPS, behind a user gesture.
 * Safari (iOS/iPadOS/macOS) ships no Web NFC support at all, so callers must
 * feature-detect with {@link isWebNfcSupported} and fall back to "copy the
 * link, write it with a free NFC-writing app" everywhere else.
 */

interface NdefWriteRecord {
  readonly recordType: "url";
  readonly data: string;
}

interface NdefReaderLike {
  write(message: {
    readonly records: readonly NdefWriteRecord[];
  }): Promise<void>;
}

interface WindowWithWebNfc {
  readonly NDEFReader?: new () => NdefReaderLike;
}

export function isWebNfcSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as WindowWithWebNfc).NDEFReader === "function"
  );
}

/**
 * Resolves once the browser has written `url` to a tag the user taps their
 * phone against. Rejects if the browser lacks support, the user denies the
 * NFC permission prompt, or no tag is presented before the OS-level scan
 * session is cancelled.
 */
export async function writeUrlToNfcTag(url: string): Promise<void> {
  const Reader = (window as unknown as WindowWithWebNfc).NDEFReader;
  if (!Reader) {
    throw new Error("Este navegador não tem suporte a Web NFC.");
  }
  const reader = new Reader();
  await reader.write({ records: [{ recordType: "url", data: url }] });
}

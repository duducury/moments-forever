/**
 * One place for "share a link": the system share sheet when the browser / iOS
 * app web view has it (Web Share API), a plain copy otherwise.
 *
 *  - iPhone / Android / modern browsers: `navigator.share` opens the native
 *    sheet (AirDrop, Mensagens, WhatsApp, Copiar…). Inside the Capacitor iOS
 *    shell this is the WKWebView's own Web Share support — no plugin needed.
 *  - Closing the sheet is normal, not an error ("cancelled").
 *  - No Web Share (desktop browsers, old web views) or the share was refused
 *    (e.g. the tap's user gesture was already used up): the link is copied.
 *
 * The URL is always the real page URL the caller passes; nothing is rewritten.
 */

export interface SharePayload {
  /** Absolute http(s) URL of the page being shared. */
  readonly url: string;
  readonly title?: string;
  readonly text?: string;
}

/** "shared" and "cancelled" need no message; "copied" needs a "link copiado" hint; "failed" needs a manual-copy prompt. */
export type ShareResult = "shared" | "cancelled" | "copied" | "failed";

interface ShareNavigator {
  readonly share?: (data: { url?: string; title?: string; text?: string; files?: File[] }) => Promise<void>;
  readonly canShare?: (data: { files?: File[] }) => boolean;
  readonly clipboard?: { readonly writeText?: (text: string) => Promise<void> };
}

interface CopyDocument {
  readonly body: {
    appendChild(node: unknown): unknown;
    removeChild(node: unknown): unknown;
  };
  createElement(tag: "textarea"): {
    value: string;
    style: Record<string, string>;
    setAttribute(name: string, value: string): void;
    select(): void;
  };
  execCommand(command: "copy"): boolean;
}

export interface ShareDeps {
  readonly navigator?: ShareNavigator;
  readonly document?: CopyDocument;
}

function defaultNavigator(): ShareNavigator | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as unknown as ShareNavigator);
}

function defaultDocument(): CopyDocument | undefined {
  return typeof document === "undefined" ? undefined : (document as unknown as CopyDocument);
}

/** True when this browser / web view can open the system share sheet. */
export function canShareNatively(nav: ShareNavigator | undefined = defaultNavigator()): boolean {
  return typeof nav?.share === "function";
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** The person closed the share sheet. */
export function isShareCancellation(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  // DOMException.ABORT_ERR is 20; some web views only set the code.
  return name === "AbortError" || (error as { code?: unknown } | null)?.code === 20;
}

/** Copies text: Clipboard API first, then the old textarea + execCommand route. */
export async function copyLink(
  url: string,
  deps: ShareDeps = {},
): Promise<"copied" | "failed"> {
  const nav = deps.navigator ?? defaultNavigator();
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(url);
      return "copied";
    }
  } catch {
    // Fall through to the textarea route (clipboard can be blocked by permissions).
  }
  const doc = deps.document ?? defaultDocument();
  if (!doc) return "failed";
  try {
    const field = doc.createElement("textarea");
    field.value = url;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    doc.body.appendChild(field);
    field.select();
    const ok = doc.execCommand("copy");
    doc.body.removeChild(field);
    return ok ? "copied" : "failed";
  } catch {
    return "failed";
  }
}

export async function shareLink(
  payload: SharePayload,
  deps: ShareDeps = {},
): Promise<ShareResult> {
  if (!isHttpUrl(payload.url)) return "failed";

  const nav = deps.navigator ?? defaultNavigator();
  if (nav && typeof nav.share === "function") {
    const data: { url: string; title?: string; text?: string } = { url: payload.url };
    if (payload.title) data.title = payload.title;
    if (payload.text) data.text = payload.text;
    try {
      await nav.share(data);
      return "shared";
    } catch (error) {
      if (isShareCancellation(error)) return "cancelled";
      // The share was refused (no user gesture left, unsupported data…): copy instead.
    }
  }
  return copyLink(payload.url, deps);
}

/**
 * Shares an image/file through the system sheet (Instagram, Mensagens, "Salvar
 * imagem"…). "unsupported" when this browser / web view cannot share files —
 * the caller then offers a download instead. Closing the sheet is "cancelled".
 */
export async function shareFile(
  file: File,
  data: { readonly title?: string; readonly text?: string } = {},
  deps: ShareDeps = {},
): Promise<"shared" | "cancelled" | "unsupported"> {
  const nav = deps.navigator ?? defaultNavigator();
  if (!nav || typeof nav.share !== "function") return "unsupported";
  if (typeof nav.canShare !== "function" || !nav.canShare({ files: [file] })) return "unsupported";
  const payload: { files: File[]; title?: string; text?: string } = { files: [file] };
  if (data.title) payload.title = data.title;
  if (data.text) payload.text = data.text;
  try {
    await nav.share(payload);
    return "shared";
  } catch (error) {
    return isShareCancellation(error) ? "cancelled" : "unsupported";
  }
}

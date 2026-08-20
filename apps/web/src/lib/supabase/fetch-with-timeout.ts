// Generous on purpose: a Vercel cold start plus a cold Supabase connection
// pool can legitimately take 15-20s on the very first request after idle.
// This only exists to catch a truly stuck connection, not ordinary latency.
const DEFAULT_TIMEOUT_MS = 30_000;

function mergeSignals(
  a: AbortSignal | null | undefined,
  b: AbortSignal,
): AbortSignal {
  if (!a) return b;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([a, b]);
  }
  if (a.aborted || b.aborted) {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

/**
 * Bounds every Supabase request so a stalled connection fails fast with a
 * catchable error instead of hanging until the platform/browser kills the
 * page load. An unbounded hang on the iPhone Home Screen app surfaces as
 * WKWebView's native "This page couldn't load" instead of our error.tsx.
 */
export function fetchWithTimeout(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      signal: mergeSignals(init?.signal, AbortSignal.timeout(timeoutMs)),
    });
}

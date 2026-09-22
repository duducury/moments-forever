/**
 * Best-effort in-memory sliding-window limiter. There's no shared
 * rate-limit infra (Redis/Upstash) in this project yet, and this process
 * memory resets per serverless instance/cold start — so this slows down a
 * single-instance brute force, it does not guarantee a hard cap across a
 * distributed attack. Treat it as a speed bump, not the real defense
 * (that's code entropy + generic errors + RLS blocking direct table reads).
 */
const attempts = new Map<string, number[]>();

export function isRateLimited(
  key: string,
  maxAttempts: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const history = (attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < windowMs,
  );
  if (history.length >= maxAttempts) {
    attempts.set(key, history);
    return true;
  }
  history.push(now);
  attempts.set(key, history);
  return false;
}

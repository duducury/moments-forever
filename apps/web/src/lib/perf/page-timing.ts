/**
 * Opt-in timing of server-rendered pages, for measuring where a navigation spends its time.
 * Off unless PERF_LOG=1 is set in the environment (set it on a Vercel Preview only); when on, each page logs ONE line
 * with the elapsed milliseconds of every step, e.g.
 *   [perf] passaporte auth=118 data=262 total=391
 * (read it in the Vercel function logs). It records durations only: no user ids, tokens or data.
 */
export function pageTimer(page: string): { mark: (step: string) => void; end: () => void } {
  if (process.env.PERF_LOG !== "1") return { mark: () => undefined, end: () => undefined };
  const start = Date.now();
  let last = start;
  const steps: string[] = [];
  return {
    mark(step) {
      const now = Date.now();
      steps.push(`${step}=${now - last}`);
      last = now;
    },
    end() {
      console.log(`[perf] ${page} ${steps.join(" ")} total=${Date.now() - start}`);
    },
  };
}

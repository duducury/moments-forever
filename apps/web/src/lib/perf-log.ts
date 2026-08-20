/**
 * Temporary diagnostic timing for slow server-side page loads (shows up in
 * Vercel function logs). Remove once the "álbum demora/erra ao carregar"
 * report is root-caused — see conversation from 2026-08-20.
 */
export async function timeStep<T>(
  label: string,
  work: () => PromiseLike<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    console.log(`[perf] ${label}: ${Math.round(performance.now() - start)}ms`);
  }
}

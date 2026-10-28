/**
 * Per-stage timings of "Encontrar uma viagem" / "Adicionar fotos", so a slow import can be explained with numbers
 * instead of guesses. Always recorded in memory (a handful of numbers per import: `window.__mfImportTimings`);
 * printed to the console only when `localStorage.mfImportTiming === "1"`. No personal data: stage names and
 * milliseconds only.
 */

export interface ImportTimer {
  /** Marks the END of a stage; its duration is measured from the previous mark. */
  readonly mark: (stage: string) => void;
  /** Stops the clock and publishes the run. */
  readonly finish: (summary?: { readonly photos?: number; readonly failed?: number }) => ImportTimingRun;
}

export interface ImportTimingRun {
  readonly flow: string;
  readonly totalMs: number;
  readonly stages: readonly { readonly stage: string; readonly ms: number }[];
  readonly photos?: number;
  readonly failed?: number;
}

declare global {
  interface Window {
    __mfImportTimings?: ImportTimingRun[];
  }
}

export function startImportTimer(flow: string, now: () => number = () => performance.now()): ImportTimer {
  const startedAt = now();
  let last = startedAt;
  const stages: { stage: string; ms: number }[] = [];
  return {
    mark(stage) {
      const at = now();
      stages.push({ stage, ms: Math.round(at - last) });
      last = at;
    },
    finish(summary = {}) {
      const run: ImportTimingRun = {
        flow,
        totalMs: Math.round(now() - startedAt),
        stages,
        ...summary,
      };
      try {
        if (typeof window !== "undefined") {
          (window.__mfImportTimings ??= []).push(run);
          window.__mfImportTimings = window.__mfImportTimings.slice(-20);
          if (window.localStorage?.getItem("mfImportTiming") === "1") {
            console.info("[import-timing]", JSON.stringify(run));
          }
        }
      } catch {
        // Diagnostics only: never let them affect an import.
      }
      return run;
    },
  };
}

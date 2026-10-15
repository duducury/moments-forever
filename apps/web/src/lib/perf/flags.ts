/**
 * Reads the performance/diagnostic switches the same tolerant way everywhere, so "1", "true", " on " or a value that
 * was pasted with quotes all count. (A strict `=== "1"` hid the measurements whenever the variable was typed a little
 * differently in the Vercel dashboard.)
 */
function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["']|["']$/gu, "").trim().toLowerCase();
}

const ON = new Set(["1", "true", "on", "yes"]);

/** PERF_LOG: per-step timings of the server-rendered pages are written to the function logs. */
export function perfLogEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return ON.has(clean(env.PERF_LOG));
}

export type PlaceCardsJoinMode = "off" | "on" | "compare";

/**
 * PLACE_CARDS_JOIN: "1"/"true"/"on" use the joined loader (falling back to the sequential one on any problem),
 * "compare" runs both and serves the sequential result, anything else (including unset) is the proven path.
 */
export function placeCardsJoinMode(env: Record<string, string | undefined> = process.env): PlaceCardsJoinMode {
  const value = clean(env.PLACE_CARDS_JOIN);
  if (ON.has(value)) return "on";
  if (value === "compare") return "compare";
  return "off";
}

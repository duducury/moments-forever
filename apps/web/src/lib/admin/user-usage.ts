/** Live trip and photo totals for one account, as returned by the admin_user_usage() RPC. */
export interface UserUsage {
  readonly trips: number;
  readonly photos: number;
}

function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Rows of admin_user_usage() keyed by user id. Postgres `bigint` can arrive
 * as a number or a string depending on the driver, so both are accepted. An
 * account missing from the result simply has no entry — callers decide how to
 * show "unknown" (that is different from a real zero).
 */
export function parseUserUsageRows(rows: unknown): Map<string, UserUsage> {
  const usage = new Map<string, UserUsage>();
  if (!Array.isArray(rows)) return usage;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { user_id, trips_count, photos_count } = row as Record<string, unknown>;
    if (typeof user_id !== "string") continue;
    usage.set(user_id, {
      trips: toCount(trips_count),
      photos: toCount(photos_count),
    });
  }
  return usage;
}

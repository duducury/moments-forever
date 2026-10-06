/**
 * `photos.source_asset_id` = '<platform>:<native id>' — which photo of the
 * phone's library a Moments Forever photo came from. Kept on the photo row so
 * deleting the photo also forgets it (the photo can then be found again).
 */

export type NativePlatform = "ios" | "android";

const SOURCE_ASSET_ID = /^(ios|android):[^\u0000-\u001f]{1,190}$/u;

export function buildSourceAssetId(
  platform: NativePlatform,
  nativeId: string,
): string {
  return `${platform}:${nativeId}`;
}

/** Valid id or null — never throws, so callers can drop a bad value silently. */
export function normalizeSourceAssetId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return SOURCE_ASSET_ID.test(value) ? value : null;
}

/** True when a Postgres/PostgREST error is about the column not being migrated yet. */
export function isMissingSourceAssetColumn(message: string | undefined): boolean {
  return Boolean(message && /source_asset_id/iu.test(message));
}

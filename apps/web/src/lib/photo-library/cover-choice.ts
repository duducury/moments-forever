/**
 * "Encontrar viagem" → confirmation: which of the trip's chosen photos becomes the album
 * cover. Pure helpers; the photos are the ones already found/selected, nothing new is read.
 */

import { pickPreview } from "./selection";
import { buildSourceAssetId } from "./source-asset-id";
import type { LibraryAsset } from "./types";

/** Same limit as the trip story everywhere else in the app. */
export const TRIP_STORY_MAX_LENGTH = 4000;

/** The chosen cover when it is still one of the selected photos, otherwise the first of them. */
export function effectiveCover(
  assets: readonly LibraryAsset[],
  chosenNativeId: string | undefined,
): LibraryAsset | null {
  return assets.find((asset) => asset.nativeId === chosenNativeId) ?? assets[0] ?? null;
}

/**
 * Photos offered as cover: spread evenly over the whole trip (so it is not only the first
 * minutes of it), always including the current cover. `count` is how many to show.
 */
export function coverChoices(
  assets: readonly LibraryAsset[],
  count: number,
  current: LibraryAsset | null,
): LibraryAsset[] {
  const sample = pickPreview(assets, Math.max(count, 1));
  if (!current || sample.some((asset) => asset.nativeId === current.nativeId)) return sample;
  return [current, ...sample.slice(0, Math.max(count - 1, 0))];
}

/** The exported File that came from the chosen library photo (null if it could not be exported). */
export function findCoverFile(
  files: readonly File[],
  origins: ReadonlyMap<File, { readonly sourceAssetId: string }>,
  asset: LibraryAsset | null,
): File | null {
  if (!asset) return null;
  const wanted = buildSourceAssetId(asset.platform, asset.nativeId);
  return files.find((file) => origins.get(file)?.sourceAssetId === wanted) ?? null;
}

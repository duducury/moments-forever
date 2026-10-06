"use client";

import type { LibraryAsset } from "@/lib/photo-library/types";

import styles from "./find-trips.module.css";

/**
 * EVERY photo of the trip as a grid. All cells exist from the start (so the
 * scroll has its real length); the pictures are requested from the phone in
 * batches by the parent, following the scroll position.
 */
export function PhotoGrid({
  assets,
  ticked,
  thumbs,
  onToggle,
}: {
  readonly assets: readonly LibraryAsset[];
  readonly ticked: ReadonlySet<string>;
  readonly thumbs: ReadonlyMap<string, string>;
  readonly onToggle: (nativeId: string) => void;
}) {
  return (
    <div className={styles.grid}>
      {assets.map((asset) => {
        const on = ticked.has(asset.nativeId);
        const src = thumbs.get(asset.nativeId);
        return (
          <button
            aria-label={on ? "Desmarcar foto" : "Selecionar foto"}
            aria-pressed={on}
            className={styles.cell}
            data-selected={on ? "true" : "false"}
            key={asset.nativeId}
            onClick={() => onToggle(asset.nativeId)}
            type="button"
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL thumbnail
              <img alt="" decoding="async" src={src} />
            ) : null}
            <span aria-hidden className={styles.cellMark}>✓</span>
          </button>
        );
      })}
    </div>
  );
}

"use client";

import type { LibraryAsset } from "@/lib/photo-library/types";

import styles from "./find-trips.module.css";

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

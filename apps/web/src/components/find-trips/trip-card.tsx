"use client";

import {
  describeCounts,
  pickPreview,
  selectedCount,
  type Candidate,
  type Selection,
} from "@/lib/photo-library/selection";

import styles from "./find-trips.module.css";
import { useVisibleOnce } from "./use-visible";

export const PREVIEW_COUNT = 5;

export function formatPeriod(period: Candidate["period"]): string {
  if (!period) return "";
  const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const month = (iso: string) =>
    parse(iso).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" });
  const dayNumber = (iso: string) => parse(iso).getUTCDate();
  const year = (iso: string) => parse(iso).getUTCFullYear();
  const { start, end } = period;
  if (start === end) return `${dayNumber(start)} de ${month(start)} de ${year(start)}`;
  if (month(start) === month(end) && year(start) === year(end)) {
    return `${dayNumber(start)}–${dayNumber(end)} de ${month(start)} de ${year(start)}`;
  }
  if (year(start) === year(end)) {
    return `${dayNumber(start)} de ${month(start)} – ${dayNumber(end)} de ${month(end)} de ${year(end)}`;
  }
  return `${dayNumber(start)} de ${month(start)} de ${year(start)} – ${dayNumber(end)} de ${month(end)} de ${year(end)}`;
}

export function photosLabel(count: number): string {
  return `${count} foto${count === 1 ? "" : "s"}`;
}

export function Flag({ code }: { readonly code: string | null }) {
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
    <img
      alt=""
      className={styles.flag}
      decoding="async"
      height={16}
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      width={22}
    />
  );
}

/** Real pictures of the trip, spread over its whole length. */
export function PreviewStrip({
  ids,
  total,
  thumbs,
  size = "large",
}: {
  readonly ids: readonly string[];
  readonly total: number;
  readonly thumbs: ReadonlyMap<string, string>;
  readonly size?: "large" | "small";
}) {
  const more = total - ids.length;
  return (
    <div className={size === "large" ? styles.strip : styles.stripSmall}>
      {ids.map((id, index) => {
        const src = thumbs.get(id);
        const last = index === ids.length - 1 && more > 0;
        return (
          <span className={styles.stripCell} key={id}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL thumbnail
              <img alt="" decoding="async" src={src} />
            ) : null}
            {last ? <span className={styles.stripMore}>+{more}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

export function TripCard({
  candidate,
  selection,
  thumbs,
  onOpen,
  onVisible,
}: {
  readonly candidate: Candidate;
  readonly selection: Selection;
  readonly thumbs: ReadonlyMap<string, string>;
  readonly onOpen: () => void;
  readonly onVisible: () => void;
}) {
  const ref = useVisibleOnce<HTMLElement>(onVisible);
  const total = candidate.assets.length;
  const ticked = selectedCount(candidate, selection);
  const preview = pickPreview(candidate.assets, PREVIEW_COUNT).map((asset) => asset.nativeId);
  const counts = describeCounts(total, ticked, candidate.kind);

  return (
    <article
      className={styles.card2}
      data-selected={ticked > 0 ? "true" : "false"}
      ref={ref}
    >
      <button className={styles.cardMain} onClick={onOpen} type="button">
        <span className={styles.cardHead}>
          <Flag code={candidate.countryCode} />
          {candidate.titleState === "pending" ? (
            <span aria-label="Identificando o local" className={styles.skeleton} role="status" />
          ) : (
            <span className={styles.cardTitle}>{candidate.title}</span>
          )}
        </span>
        <span className={styles.cardMeta}>
          {formatPeriod(candidate.period)}
        </span>
        {candidate.locationNote ? (
          <span className={styles.cardNote}>{candidate.locationNote}</span>
        ) : null}
        <PreviewStrip ids={preview} thumbs={thumbs} total={total} />
      </button>
      <div className={styles.cardActions}>
        <div className={styles.cardFoot}>
          <span className={styles.countFound}>{counts.found}</span>
          <button className={styles.viewAll} onClick={onOpen} type="button">
            Ver todas as fotos <span aria-hidden>›</span>
          </button>
        </div>
        <strong className={styles.countSelected} data-active={ticked > 0 ? "true" : "false"}>
          {counts.selected}
        </strong>
      </div>
    </article>
  );
}

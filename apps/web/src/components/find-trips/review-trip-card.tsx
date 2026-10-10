"use client";

import { useEffect, useState } from "react";

import { coverChoices, effectiveCover, TRIP_STORY_MAX_LENGTH } from "@/lib/photo-library/cover-choice";
import type { Candidate } from "@/lib/photo-library/selection";
import type { LibraryAsset } from "@/lib/photo-library/types";

import styles from "./find-trips.module.css";
import { Flag, formatPeriod, photosLabel } from "./trip-card";

const CHOICES_STEP = 12;

/**
 * Confirmation of ONE new trip: where/when it was, its name, the story and the cover —
 * everything the person can still change before the trip is created. The cover is picked
 * from the photos already chosen for this trip (their thumbnails come from the phone's library).
 */
export function ReviewTripCard({
  candidate,
  title,
  assets,
  thumbs,
  name,
  story,
  coverId,
  onName,
  onStory,
  onCover,
  onNeedThumbs,
}: {
  readonly candidate: Candidate | undefined;
  readonly title: string;
  /** The photos chosen for this trip, in the order they were found. */
  readonly assets: readonly LibraryAsset[];
  readonly thumbs: ReadonlyMap<string, string>;
  readonly name: string;
  readonly story: string;
  readonly coverId: string | undefined;
  readonly onName: (value: string) => void;
  readonly onStory: (value: string) => void;
  readonly onCover: (nativeId: string) => void;
  readonly onNeedThumbs: (ids: readonly string[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [shown, setShown] = useState(CHOICES_STEP);
  const cover = effectiveCover(assets, coverId);
  const choices = picking ? coverChoices(assets, shown, cover) : [];
  const coverSrc = cover ? thumbs.get(cover.nativeId) : undefined;
  const period = candidate ? formatPeriod(candidate.period) : "";

  const needed = [cover?.nativeId, ...choices.map((asset) => asset.nativeId)].filter(
    (id): id is string => Boolean(id),
  );
  const neededKey = needed.join("|");
  useEffect(() => {
    if (needed.length > 0) onNeedThumbs(needed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `neededKey` stands for `needed`
  }, [neededKey, onNeedThumbs]);

  return (
    <section className={styles.reviewTrip}>
      <header className={styles.reviewHead}>
        <span className={styles.reviewTitle}>
          <Flag code={candidate?.countryCode ?? candidate?.quickCountryCode ?? null} />
          {title || "Nova viagem"}
        </span>
        <span className={styles.reviewMeta}>
          {[period, photosLabel(assets.length)].filter(Boolean).join(" · ")}
        </span>
      </header>

      <div className={styles.reviewEdit}>
        <div className={styles.coverBlock}>
          <div className={styles.coverPreview}>
            {coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL thumbnail
              <img alt="Capa escolhida para o álbum" decoding="async" src={coverSrc} />
            ) : null}
          </div>
          <button
            aria-expanded={picking}
            className={styles.coverButton}
            onClick={() => setPicking((value) => !value)}
            type="button"
          >
            {picking ? "Pronto" : "Trocar capa"}
          </button>
        </div>

        <div className={styles.reviewFields}>
          <label className={styles.fieldLabel} htmlFor={`trip-name-${candidate?.key ?? "x"}`}>
            Nome da viagem
          </label>
          <input
            className={styles.nameInput}
            id={`trip-name-${candidate?.key ?? "x"}`}
            maxLength={80}
            onChange={(event) => onName(event.target.value)}
            placeholder="Nome da viagem"
            type="text"
            value={name}
          />
          <label className={styles.fieldLabel} htmlFor={`trip-story-${candidate?.key ?? "x"}`}>
            Sobre essa viagem <span>(opcional)</span>
          </label>
          <textarea
            className={styles.storyInput}
            id={`trip-story-${candidate?.key ?? "x"}`}
            maxLength={TRIP_STORY_MAX_LENGTH}
            onChange={(event) => onStory(event.target.value)}
            placeholder="O que essa viagem significou para você?"
            rows={3}
            value={story}
          />
        </div>
      </div>

      {picking ? (
        <div className={styles.coverPicker}>
          <p className={styles.fieldLabel}>Escolha a capa entre as fotos desta viagem</p>
          <div className={styles.coverStrip} role="listbox" aria-label="Fotos para a capa">
            {choices.map((asset) => {
              const on = asset.nativeId === cover?.nativeId;
              const src = thumbs.get(asset.nativeId);
              return (
                <button
                  aria-label={on ? "Capa atual" : "Usar como capa"}
                  aria-selected={on}
                  className={styles.coverOption}
                  data-selected={on ? "true" : "false"}
                  key={asset.nativeId}
                  onClick={() => onCover(asset.nativeId)}
                  role="option"
                  type="button"
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local data URL thumbnail
                    <img alt="" decoding="async" src={src} />
                  ) : null}
                </button>
              );
            })}
            {shown < assets.length ? (
              <button className={styles.coverMore} onClick={() => setShown((value) => value + CHOICES_STEP)} type="button">
                Mais fotos
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

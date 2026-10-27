"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { shortPlaceCaption } from "@moments-forever/shared";

import { toneFromId } from "@/app/trip/[slug]/album-types";
import type { ProfileCarouselPhoto } from "@/lib/experiences/load-owner-carousel-photos";
import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";
import {
  polaroidAnimationNames,
  polaroidKeyframesCss,
  polaroidRotationDegrees,
} from "@/lib/perfil/polaroid-keyframes";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

import styles from "./perfil.module.css";
import { CountryFlagImage } from "@/components/country-flag-image";

/** Photos in the stack at once. More would make each cycle too long and the stack too busy. */
const MAX_STACK = 6;
/** Seconds per photo; the whole cycle is `count * SECONDS_PER_PHOTO` (the original: 10s for 5 photos). */
const SECONDS_PER_PHOTO = 2;

function folderHref(photo: ProfileCarouselPhoto): string | null {
  if (!photo.experienceSlug || !photo.albumId) return null;
  // Opens the trip folder grid, not the lightbox.
  return profileTripAlbumPath(photo.experienceSlug, photo.albumId);
}

/** Year the photo was taken, from its real capture date; null when unknown. */
function captureYear(capturedAt: string | null): number | null {
  if (!capturedAt) return null;
  const year = new Date(capturedAt).getFullYear();
  return Number.isFinite(year) ? year : null;
}

function PolaroidPhoto({
  photo,
  index,
  count,
  preferFull,
}: {
  readonly photo: ProfileCarouselPhoto;
  readonly index: number;
  readonly count: number;
  readonly preferFull: boolean;
}) {
  const thumbSrc = useLocalPhotoObjectUrl(photo.id, "thumbnail");
  const fullSrc = useLocalPhotoObjectUrl(preferFull ? photo.id : null, "full");
  const caption = shortPlaceCaption(photo.locationLabel);
  const href = folderHref(photo);
  const year = captureYear(photo.capturedAt);
  const names = polaroidAnimationNames(count);
  const style = {
    ["--i" as string]: index + 1,
    ["--n" as string]: count,
    ["--r" as string]: `${polaroidRotationDegrees(photo.id)}deg`,
    // The last photo uses the "z-order-last" keyframes, as in the original.
    ...(count > 1
      ? {
          animationName: `${names.slide}, ${index === count - 1 ? names.zLast : names.z}`,
        }
      : null),
  } as CSSProperties;

  const body = (
    <>
      <span
        className={styles.polaroidPhoto}
        data-has-image={thumbSrc || fullSrc ? "true" : "false"}
        data-tone={toneFromId(photo.id)}
      >
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className={styles.polaroidImage}
            decoding="async"
            draggable={false}
            loading={index < 2 ? "eager" : "lazy"}
            src={thumbSrc}
          />
        ) : null}
        {fullSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className={`${styles.polaroidImage} ${styles.polaroidImageFull}`}
            decoding="async"
            draggable={false}
            src={fullSrc}
          />
        ) : null}
      </span>
      <span className={styles.polaroidCaption}>
        {caption ? (
          <span className={styles.carouselPlaceCaption}>
            {caption.countryCode ? (
              <CountryFlagImage
                code={caption.countryCode}
                alt=""
                className={styles.carouselPlaceFlag}
                height={14}
                width={18}
              />
            ) : null}
            <span>{caption.shortLabel}</span>
          </span>
        ) : null}
        {year ? <span className={styles.polaroidYear}>{year}</span> : null}
      </span>
    </>
  );

  const label = caption
    ? `Abrir pasta desta viagem: ${caption.shortLabel}${year ? `, ${year}` : ""}`
    : "Abrir pasta desta viagem";

  // A plain link: a hard navigation is more reliable than router.push in an iOS standalone PWA.
  return href ? (
    <a aria-label={label} className={styles.polaroidCard} href={href} style={style}>
      {body}
    </a>
  ) : (
    <div className={styles.polaroidCard} style={style}>
      {body}
    </div>
  );
}

/**
 * Destaques: photos stacked in the same spot; the top one slides out to the side, drops behind and comes back, one after
 * another, forever (the "stacked photos" CSS animation). Pure CSS motion: each card's `--i` / `--n` offset its own
 * animation-delay, so it works for any number of photos. Paused while hovered/focused, off screen or when the user asks
 * for reduced motion (then it is a static, tilted stack).
 */
export function PolaroidStack({
  photos,
}: {
  readonly photos: readonly ProfileCarouselPhoto[];
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const shown = photos.slice(0, MAX_STACK);
  const count = shown.length;

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      // Without observer support just run (and load the large versions).
      const frame = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? true),
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (count === 0) return null;

  return (
    <div className={styles.polaroidStage} ref={wrapRef}>
      {count > 1 ? <style>{polaroidKeyframesCss(count)}</style> : null}
      <div
        className={styles.polaroidStack}
        data-animate={count > 1 ? "true" : "false"}
        data-paused={inView ? "false" : "true"}
        style={
          {
            ["--d" as string]: `${(count * SECONDS_PER_PHOTO).toFixed(1)}s`,
          } as CSSProperties
        }
      >
        {shown.map((photo, index) => (
          <PolaroidPhoto
            count={count}
            index={index}
            key={photo.id}
            photo={photo}
            preferFull={inView}
          />
        ))}
      </div>
    </div>
  );
}

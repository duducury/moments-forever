"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { shortPlaceCaption } from "@moments-forever/shared";

import { toneFromId } from "@/app/trip/[slug]/album-types";
import type { ProfileCarouselPhoto } from "@/lib/experiences/load-owner-carousel-photos";
import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

import styles from "./perfil.module.css";

/** Photos in the stack at once. More would make each cycle too long and the stack too busy. */
const MAX_STACK = 6;
/** Seconds each photo spends per turn; the whole cycle is `count * SECONDS_PER_PHOTO`. */
const SECONDS_PER_PHOTO = 2.2;

function folderHref(photo: ProfileCarouselPhoto): string | null {
  if (!photo.experienceSlug || !photo.albumId) return null;
  // Opens the trip folder grid, not the lightbox.
  return profileTripAlbumPath(photo.experienceSlug, photo.albumId);
}

/** Stable per-photo rotation in -10deg..10deg (the reference used random(30) - 15). */
function rotationForPhoto(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 9973;
  }
  return (hash % 21) - 10;
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
  const style = {
    ["--i" as string]: index + 1,
    ["--n" as string]: count,
    ["--r" as string]: `${rotationForPhoto(photo.id)}deg`,
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
              // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
              <img
                alt=""
                className={styles.carouselPlaceFlag}
                decoding="async"
                height={14}
                src={`https://flagcdn.com/w40/${caption.countryCode.toLowerCase()}.png`}
                width={18}
              />
            ) : null}
            <span>{caption.shortLabel}</span>
          </span>
        ) : null}
      </span>
    </>
  );

  const label = caption
    ? `Abrir pasta desta viagem: ${caption.shortLabel}`
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

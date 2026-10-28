"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { CountryFlagImage } from "@/components/country-flag-image";
import { prefetchLocalPhotoFullOnIntent } from "@/lib/local-photos/local-photo-object-url-cache";
import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";
import { miniMapTiles, openInMapsUrl } from "@/lib/photos/lightbox-map";

import { toneFromId, type TripPhoto } from "./album-types";
import styles from "./trip.module.css";

/* ---------------------------------------------------------------- icons */

type IconProps = { readonly className?: string };

function Svg({ children, className }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="20"
    >
      {children}
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return <Svg {...props}><path d="m15 5-7 7 7 7" /></Svg>;
}
export function IconChevronRight(props: IconProps) {
  return <Svg {...props}><path d="m9 5 7 7-7 7" /></Svg>;
}
export function IconMore(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" fill="currentColor" r="1.2" />
      <circle cx="12" cy="12" fill="currentColor" r="1.2" />
      <circle cx="19" cy="12" fill="currentColor" r="1.2" />
    </Svg>
  );
}
export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect height="16" rx="2.5" width="16" x="4" y="5" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </Svg>
  );
}
export function IconPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </Svg>
  );
}
export function IconExpand(props: IconProps) {
  return <Svg {...props}><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></Svg>;
}
export function IconShare(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </Svg>
  );
}
export function IconLocationOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 11-4.7M18.5 10c0 1.4-.5 2.8-1.2 4" />
      <path d="m3 3 18 18" />
    </Svg>
  );
}
export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
    </Svg>
  );
}

/* --------------------------------------------------------------- header */

export function LightboxHeader({
  onBack,
  flagCode,
  title,
  subtitle,
  dateLabel,
  menu,
  brand,
}: {
  readonly onBack: () => void;
  readonly flagCode: string | null;
  readonly title: string;
  readonly subtitle: string | null;
  readonly dateLabel: string | null;
  readonly menu: ReactNode;
  readonly brand: ReactNode;
}) {
  return (
    <>
      <button
        aria-label="Voltar"
        className={styles.lightboxRoundButton}
        onClick={onBack}
        type="button"
      >
        <IconChevronLeft />
      </button>

      <div className={styles.lightboxHeading}>
        {flagCode ? (
          <span className={styles.lightboxFlag}>
            <CountryFlagImage
              className={styles.lightboxFlagImage}
              code={flagCode}
              height={44}
              resolution="w80"
              width={44}
            />
          </span>
        ) : null}
        <h2 className={styles.lightboxTitle}>{title}</h2>
      </div>

      {brand}
      {menu}

      {/* Rows 2 and 3 of the header grid: the route, then the date — each on its own full-width line. */}
      {subtitle ? <p className={styles.lightboxSubtitle}>{subtitle}</p> : null}
      {dateLabel ? (
        <p className={styles.lightboxDate}>
          <IconCalendar className={styles.lightboxDateIcon} />
          <span>{dateLabel}</span>
        </p>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- mini map */

const MINI_MAP_WIDTH = 104;
const MINI_MAP_HEIGHT = 76;

/** Small tile preview of where the photo was taken; tapping opens the position in the maps app. */
export function LightboxMiniMap({
  latitude,
  longitude,
  label,
}: {
  readonly latitude: number;
  readonly longitude: number;
  readonly label: string | null;
}) {
  const tiles = useMemo(
    () => miniMapTiles(latitude, longitude, MINI_MAP_WIDTH, MINI_MAP_HEIGHT),
    [latitude, longitude],
  );
  return (
    <a
      aria-label="Abrir localização no mapa"
      className={styles.lightboxMiniMap}
      href={openInMapsUrl(latitude, longitude, label)}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span aria-hidden="true" className={styles.lightboxMiniMapTiles}>
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element -- map tile, tiny and external
          <img
            alt=""
            decoding="async"
            draggable={false}
            height={256}
            key={tile.key}
            loading="lazy"
            src={tile.url}
            style={{ left: tile.left, top: tile.top }}
            width={256}
          />
        ))}
      </span>
      <span aria-hidden="true" className={styles.lightboxMiniMapDot} />
      <IconExpand className={styles.lightboxMiniMapExpand} />
    </a>
  );
}

/* ------------------------------------------------------- thumbnail strip */

/** Photos drawn on each side of the open one: the strip stays light even in a 500-photo album. */
const STRIP_RADIUS = 60;

function StripThumb({
  photo,
  position,
  active,
  onSelect,
}: {
  readonly photo: TripPhoto;
  readonly position: number;
  readonly active: boolean;
  readonly onSelect: (photoId: string) => void;
}) {
  const src = useLocalPhotoObjectUrl(photo.id, "thumbnail");
  return (
    <button
      aria-current={active ? "true" : undefined}
      aria-label={`Ir para a foto ${position}`}
      className={styles.lightboxThumb}
      data-active={active ? "true" : "false"}
      data-photo-id={photo.id}
      data-tone={toneFromId(photo.id)}
      onClick={() => onSelect(photo.id)}
      onPointerDown={() => prefetchLocalPhotoFullOnIntent(photo.id)}
      type="button"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" decoding="async" draggable={false} loading="lazy" src={src} />
      ) : null}
    </button>
  );
}

export function LightboxThumbStrip({
  photos,
  index,
  onSelect,
}: {
  readonly photos: readonly TripPhoto[];
  readonly index: number;
  readonly onSelect: (photoId: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const firstScrollRef = useRef(true);
  const start = Math.max(0, index - STRIP_RADIUS);
  const end = Math.min(photos.length, index + STRIP_RADIUS + 1);
  const visible = useMemo(() => photos.slice(start, end), [photos, start, end]);
  const activeId = photos[index]?.id ?? null;

  // Keep the open photo centred in the strip.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !activeId) return;
    const thumb = Array.from(strip.children).find(
      (child): child is HTMLElement => child instanceof HTMLElement && child.dataset.photoId === activeId,
    );
    if (!thumb) return;
    const left = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2;
    const instant = firstScrollRef.current;
    firstScrollRef.current = false;
    strip.scrollTo({ left: Math.max(0, left), behavior: instant ? "auto" : "smooth" });
  }, [activeId, start]);

  if (photos.length < 2) return null;
  return (
    <div
      aria-label="Fotos próximas"
      className={styles.lightboxStrip}
      ref={stripRef}
      role="list"
    >
      {visible.map((photo, offset) => (
        <StripThumb
          active={photo.id === activeId}
          key={photo.id}
          onSelect={onSelect}
          photo={photo}
          position={start + offset + 1}
        />
      ))}
    </div>
  );
}

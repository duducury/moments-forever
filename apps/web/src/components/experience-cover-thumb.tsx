"use client";

import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";

/**
 * Renders a trip/place cover from IndexedDB by photo id.
 * Cover surfaces request the MVP preview (`full` / R2 original key); thumb is placeholder.
 * Compact pickers can keep `variant="thumbnail"`.
 */
export function ExperienceCoverThumb({
  coverPhotoId,
  title,
  className,
  imageClassName,
  fallbackClassName,
  variant = "cover",
}: {
  readonly coverPhotoId: string | null;
  readonly title: string;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly fallbackClassName?: string;
  /** `cover` = preview quality; `thumbnail` = small preview only. */
  readonly variant?: "cover" | "thumbnail";
}) {
  const initial = title.trim().slice(0, 1).toUpperCase() || "·";

  if (variant === "thumbnail") {
    return (
      <CoverThumbOnly
        className={className}
        coverPhotoId={coverPhotoId}
        fallbackClassName={fallbackClassName}
        imageClassName={imageClassName}
        initial={initial}
      />
    );
  }

  return (
    <CoverFull
      className={className}
      coverPhotoId={coverPhotoId}
      fallbackClassName={fallbackClassName}
      imageClassName={imageClassName}
      initial={initial}
    />
  );
}

function CoverThumbOnly({
  coverPhotoId,
  className,
  imageClassName,
  fallbackClassName,
  initial,
}: {
  readonly coverPhotoId: string | null;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly fallbackClassName?: string;
  readonly initial: string;
}) {
  const src = useLocalPhotoObjectUrl(coverPhotoId, "thumbnail");
  if (src) {
    return (
      <span className={className} data-has-image="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className={imageClassName} decoding="async" src={src} />
      </span>
    );
  }
  return (
    <CoverFallback
      className={fallbackClassName ?? className}
      coverPhotoId={coverPhotoId}
      initial={initial}
    />
  );
}

function CoverFull({
  coverPhotoId,
  className,
  imageClassName,
  fallbackClassName,
  initial,
}: {
  readonly coverPhotoId: string | null;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly fallbackClassName?: string;
  readonly initial: string;
}) {
  // Load MVP preview (`full`) for trip/place covers — thumbnails look soft on wide cards.
  const thumbSrc = useLocalPhotoObjectUrl(coverPhotoId, "thumbnail");
  const fullSrc = useLocalPhotoObjectUrl(coverPhotoId, "full");
  const hasImage = Boolean(thumbSrc || fullSrc);

  if (!hasImage) {
    return (
      <CoverFallback
        className={fallbackClassName ?? className}
        coverPhotoId={coverPhotoId}
        initial={initial}
      />
    );
  }

  return (
    <span
      className={className}
      data-has-image="true"
      data-progressive-cover="true"
    >
      {thumbSrc && !fullSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={imageClassName}
          decoding="async"
          src={thumbSrc}
        />
      ) : null}
      {fullSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={imageClassName}
          data-cover-full=""
          decoding="async"
          src={fullSrc}
        />
      ) : null}
    </span>
  );
}

function CoverFallback({
  className,
  coverPhotoId,
  initial,
}: {
  readonly className?: string;
  readonly coverPhotoId: string | null;
  readonly initial: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      data-has-image="false"
    >
      <span>{coverPhotoId ? "…" : initial}</span>
    </span>
  );
}

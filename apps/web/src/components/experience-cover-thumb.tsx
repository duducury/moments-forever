"use client";

import { useState } from "react";

import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";

/**
 * Renders a trip/place cover from IndexedDB / `/api/media` by photo id.
 * Cover surfaces request the MVP preview (`full` / R2 original key); thumb is LQIP.
 * Compact pickers and profile cards keep `variant="thumbnail"`.
 */
export function ExperienceCoverThumb({
  coverPhotoId,
  title,
  className,
  imageClassName,
  fallbackClassName,
  variant = "cover",
  priority = false,
}: {
  readonly coverPhotoId: string | null;
  readonly title: string;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly fallbackClassName?: string;
  /** `cover` = preview quality; `thumbnail` = small preview only. */
  readonly variant?: "cover" | "thumbnail";
  /** LCP hero — start the network with high priority. */
  readonly priority?: boolean;
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
        priority={priority}
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
      priority={priority}
    />
  );
}

function CoverThumbOnly({
  coverPhotoId,
  className,
  imageClassName,
  fallbackClassName,
  initial,
  priority,
}: {
  readonly coverPhotoId: string | null;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly fallbackClassName?: string;
  readonly initial: string;
  readonly priority: boolean;
}) {
  const src = useLocalPhotoObjectUrl(coverPhotoId, "thumbnail");
  if (src) {
    return (
      <span className={className} data-has-image="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className={imageClassName}
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
          loading={priority ? "eager" : "lazy"}
          src={src}
        />
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
  priority,
}: {
  readonly coverPhotoId: string | null;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly fallbackClassName?: string;
  readonly initial: string;
  readonly priority: boolean;
}) {
  const thumbSrc = useLocalPhotoObjectUrl(coverPhotoId, "thumbnail");
  const fullSrc = useLocalPhotoObjectUrl(coverPhotoId, "full");
  const localFull = Boolean(fullSrc?.startsWith("blob:"));
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const showFull = Boolean(fullSrc && (localFull || loadedSrc === fullSrc));
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
      {thumbSrc && !showFull ? (
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
          fetchPriority={priority ? "high" : "low"}
          onError={() => setLoadedSrc(fullSrc)}
          onLoad={() => setLoadedSrc(fullSrc)}
          src={fullSrc}
          style={{ opacity: showFull ? 1 : 0 }}
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

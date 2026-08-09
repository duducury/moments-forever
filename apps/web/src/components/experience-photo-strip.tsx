"use client";

import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";

import styles from "./experience-photo-strip.module.css";

function StripThumb({ photoId }: { readonly photoId: string }) {
  const src = useLocalPhotoObjectUrl(photoId, "thumbnail");
  return (
    <span className={styles.thumb} data-has-image={src ? "true" : "false"}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className={styles.image} decoding="async" src={src} />
      ) : null}
    </span>
  );
}

/**
 * Small strip of real local photos for Admin / Perfil cards.
 * Resolves the same photo.id → IndexedDB blobs as /trip.
 */
export function ExperiencePhotoStrip({
  photoIds,
}: {
  readonly photoIds: readonly string[];
}) {
  if (photoIds.length === 0) return null;
  return (
    <div aria-hidden="true" className={styles.strip}>
      {photoIds.slice(0, 4).map((photoId) => (
        <StripThumb key={photoId} photoId={photoId} />
      ))}
    </div>
  );
}

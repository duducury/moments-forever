"use client";

import { useRouter } from "next/navigation";
import { shortPlaceCaption } from "@moments-forever/shared";

import { AlbumCarousel } from "@/app/trip/[slug]/album/[albumId]/album-carousel";
import type { ProfileCarouselPhoto } from "@/lib/experiences/load-owner-carousel-photos";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

import styles from "./perfil.module.css";

export function ProfileCarousel({
  photos,
}: {
  readonly photos: readonly ProfileCarouselPhoto[];
}) {
  const router = useRouter();

  if (photos.length === 0) return null;

  function openPlace(photoId: string) {
    const photo = photos.find((item) => item.id === photoId);
    if (!photo?.albumId || !photo.experienceSlug) return;
    router.push(
      profileTripAlbumPath(photo.experienceSlug, photo.albumId, {
        photoId: photo.id,
      }),
    );
  }

  return (
    <section aria-label="Destaques" className={styles.carouselSection}>
      <div className={styles.mapHeader}>
        <h2 className={styles.sectionTitle}>Destaques</h2>
      </div>
      <AlbumCarousel
        centerActionLabel="Abrir esta foto no lugar"
        getCaption={(photo) => {
          const caption = shortPlaceCaption(photo.locationLabel);
          if (!caption) return null;
          return (
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
          );
        }}
        getCaptionText={(photo) =>
          shortPlaceCaption(photo.locationLabel)?.shortLabel ?? null
        }
        onOpen={openPlace}
        photos={photos}
      />
    </section>
  );
}

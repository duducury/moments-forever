"use client";

import { shortPlaceCaption } from "@moments-forever/shared";

import { AlbumCarousel } from "@/app/trip/[slug]/album/[albumId]/album-carousel";
import type { ProfileCarouselPhoto } from "@/lib/experiences/load-owner-carousel-photos";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

import styles from "./perfil.module.css";

function folderHrefForPhoto(photo: ProfileCarouselPhoto): string | null {
  if (!photo.experienceSlug || !photo.albumId) return null;
  // Open the trip folder grid — not the lightbox (no ?photo=).
  return profileTripAlbumPath(photo.experienceSlug, photo.albumId);
}

export function ProfileCarousel({
  photos,
}: {
  readonly photos: readonly ProfileCarouselPhoto[];
}) {
  if (photos.length === 0) return null;

  /** Destaques misturam viagens — cada foto abre a pasta (álbum) daquela viagem. */
  function openPlaceFolder(photoId: string) {
    const photo = photos.find((item) => item.id === photoId);
    if (!photo) return;
    const href = folderHrefForPhoto(photo);
    if (!href) return;
    // Hard navigation is more reliable than router.push in iOS standalone PWA.
    window.location.assign(href);
  }

  return (
    <section aria-label="Destaques" className={styles.carouselSection}>
      <div className={styles.mapHeader}>
        <h2 className={styles.sectionTitle}>Destaques</h2>
      </div>
      <AlbumCarousel
        centerActionLabel="Abrir pasta desta viagem"
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
        getHref={(photo) => {
          const match = photos.find((item) => item.id === photo.id);
          return match ? folderHrefForPhoto(match) : null;
        }}
        onOpen={openPlaceFolder}
        photos={photos}
      />
    </section>
  );
}

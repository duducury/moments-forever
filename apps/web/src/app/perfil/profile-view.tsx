import type { ReactNode } from "react";

import { countryCodeFromPlaceLabel } from "@moments-forever/shared";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppCreditFooter } from "@/components/app-credit-footer";
import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { NewTripButton } from "@/components/new-trip-button";
import { RememberOwnerHome } from "@/components/remember-owner-home";
import { R2UploadWarningBanner } from "@/components/r2-upload-warning-banner";
import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import type { ProfileCarouselPhoto } from "@/lib/experiences/load-owner-carousel-photos";
import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
import { profilePath } from "@/lib/routes/app-routes";

import styles from "./perfil.module.css";
import { ProfileCarousel } from "./profile-carousel";
import { ProfileHeader } from "./profile-header";
import { ProfilePlacesSection } from "./profile-places-section";

export function ProfileView({
  ownerId,
  displayName,
  bio,
  avatarPhotoId,
  avatarRemoteSrc = null,
  isOwner,
  places,
  carouselPhotos = [],
  loadError,
  homeHref = profilePath(),
  mapSlot = null,
  carouselSlot = null,
  gridPending = false,
}: {
  readonly ownerId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatarPhotoId: string | null;
  readonly avatarRemoteSrc?: string | null;
  readonly isOwner: boolean;
  readonly places: readonly OwnerPlaceCardItem[];
  readonly carouselPhotos?: readonly ProfileCarouselPhoto[];
  readonly loadError: string | null;
  /** Canonical profile URL for bottom-nav Início (public slug when known). */
  readonly homeHref?: string;
  /** Streamed bottom map — GPS + MapLibre must not block Início. */
  readonly mapSlot?: ReactNode;
  /** Streamed Destaques so the place grid can paint first. */
  readonly carouselSlot?: ReactNode;
  /** Header is ready; place cards are still streaming. */
  readonly gridPending?: boolean;
}) {
  const totalPhotos = places.reduce((sum, item) => sum + item.photoCount, 0);
  const visitedCountryCodes = (() => {
    const seen = new Set<string>();
    const codes: string[] = [];
    for (const place of places) {
      const code = (
        place.countryCode ?? countryCodeFromPlaceLabel(place.title)
      )
        ?.trim()
        .toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      codes.push(code);
    }
    return codes;
  })();

  return (
    <main className="page-shell" data-bottom-nav="true">
      <SignalPwaBootReady />
      {isOwner ? <RememberOwnerHome path={homeHref} userId={ownerId} /> : null}
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
        <div className={styles.topActions}>
          {isOwner ? (
            <NewTripButton
              className={`${styles.newTripNavButton} hide-when-bottom-nav`}
            >
              Nova viagem
            </NewTripButton>
          ) : null}
          <AuthStatus hideUserName={isOwner} />
        </div>
      </nav>

      <section className={styles.page}>
        <ProfileHeader
          avatarPhotoId={avatarPhotoId}
          avatarRemoteSrc={avatarRemoteSrc}
          bio={bio}
          countryCodes={visitedCountryCodes}
          displayName={displayName}
          isOwner={isOwner}
          ownerId={ownerId}
          photoCount={totalPhotos}
          tripCount={places.length}
        />

        {isOwner ? <R2UploadWarningBanner /> : null}

        {loadError ? (
          <p className="placeholder-note" role="alert">
            {loadError}
          </p>
        ) : null}

        {gridPending ? (
          <div
            aria-busy="true"
            aria-label="Carregando viagens"
            className={styles.gridPending}
          >
            <span className={styles.gridPendingCard} />
            <span className={styles.gridPendingCard} />
            <span className={styles.gridPendingCard} />
            <span className={styles.gridPendingCard} />
          </div>
        ) : null}

        {!loadError && !gridPending && places.length > 0
          ? (carouselSlot ?? <ProfileCarousel photos={carouselPhotos} />)
          : null}

        {!loadError && !gridPending && places.length === 0 ? (
          <div className={styles.empty} data-reveal>
            {isOwner ? (
              <>
                <p>Você ainda não tem viagens neste perfil.</p>
                <NewTripButton className="button primary">
                  Começar com fotos
                </NewTripButton>
              </>
            ) : (
              <p>Este perfil ainda não tem viagens.</p>
            )}
          </div>
        ) : null}

        {!gridPending && places.length > 0 ? (
          <ProfilePlacesSection
            isOwner={isOwner}
            places={places}
            totalPhotos={totalPhotos}
          />
        ) : null}

        {!loadError && !gridPending && places.length > 0 ? mapSlot : null}
      </section>

      <footer>
        <AppCreditFooter />
      </footer>

      <AppBottomNav
        homeHref={homeHref}
        mapHref={isOwner ? "/mapa" : `${homeHref}/mapa`}
        showCreate={isOwner}
      />
    </main>
  );
}

import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppWordmark } from "@/components/app-wordmark";
import { loadOwnerCarouselPhotos } from "@/lib/experiences/load-owner-carousel-photos";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import {
  isReservedProfileSlug,
  lookupPublicProfile,
  profileAvatarPublicPath,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileView } from "../perfil/profile-view";
import { ProfileMapSection } from "./profile-map-section";

/** Heavy profile body — must stay behind Suspense so the splash can paint first. */
export async function PublicProfileContent({
  params,
}: {
  readonly params: Promise<{ readonly profileSlug: string }>;
}) {
  const { profileSlug: raw } = await params;
  const profileSlug = decodeURIComponent(raw).trim().toLowerCase();

  if (!profileSlug || isReservedProfileSlug(profileSlug)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
        </nav>
        <section className="narrow">
          <h1>Supabase local não configurado</h1>
        </section>
      </main>
    );
  }

  const [profile, userResult] = await Promise.all([
    lookupPublicProfile(supabase, profileSlug),
    supabase.auth.getUser(),
  ]);
  if (!profile) {
    notFound();
  }

  const user = userResult.data.user;
  const isOwner = Boolean(user && user.id === profile.id);

  const [result, carouselPhotos] = await Promise.all([
    loadOwnerPlaceCards(supabase, profile.id),
    loadOwnerCarouselPhotos(supabase, profile.id),
  ]);

  const displayName = profile.displayName?.trim() || profile.profileSlug;
  const hasPlaces = (result.places?.length ?? 0) > 0;

  return (
    <ProfileView
      avatarPhotoId={profile.avatarPhotoId}
      avatarRemoteSrc={
        profile.hasPermanentAvatar
          ? profileAvatarPublicPath(profile.profileSlug)
          : null
      }
      bio={profile.bio}
      carouselPhotos={carouselPhotos}
      displayName={displayName}
      homeHref={publicProfilePath(profile.profileSlug)}
      isOwner={isOwner}
      loadError={
        result.error ? "Não foi possível carregar as viagens deste perfil." : null
      }
      mapSlot={
        hasPlaces ? (
          <Suspense fallback={null}>
            <ProfileMapSection ownerId={profile.id} />
          </Suspense>
        ) : null
      }
      ownerId={profile.id}
      places={result.places ?? []}
    />
  );
}

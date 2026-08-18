import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppWordmark } from "@/components/app-wordmark";
import { ProfileCarousel } from "@/app/perfil/profile-carousel";
import { loadOwnerCarouselPhotos } from "@/lib/experiences/load-owner-carousel-photos";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import {
  isReservedProfileSlug,
  lookupPublicProfile,
  profileAvatarPublicPath,
  publicProfilePath,
  type PublicProfile,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileView } from "../perfil/profile-view";
import { ProfileMapSection } from "./profile-map-section";

function profileViewIdentity(profile: PublicProfile, isOwner: boolean) {
  return {
    avatarPhotoId: profile.avatarPhotoId,
    avatarRemoteSrc: profile.hasPermanentAvatar
      ? profileAvatarPublicPath(profile.profileSlug)
      : null,
    bio: profile.bio,
    displayName: profile.displayName?.trim() || profile.profileSlug,
    homeHref: publicProfilePath(profile.profileSlug),
    isOwner,
    ownerId: profile.id,
  };
}

async function ProfileCarouselSection({ ownerId }: { readonly ownerId: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const photos = await loadOwnerCarouselPhotos(supabase, ownerId);
  if (photos.length === 0) return null;
  return <ProfileCarousel photos={photos} />;
}

async function ProfilePlacesBody({
  isOwner,
  profile,
}: {
  readonly isOwner: boolean;
  readonly profile: PublicProfile;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <ProfileView
        {...profileViewIdentity(profile, isOwner)}
        loadError="Não foi possível carregar as viagens deste perfil."
        places={[]}
      />
    );
  }

  const result = await loadOwnerPlaceCards(supabase, profile.id);
  const hasPlaces = (result.places?.length ?? 0) > 0;
  const identity = profileViewIdentity(profile, isOwner);

  return (
    <ProfileView
      {...identity}
      carouselSlot={
        hasPlaces ? (
          <Suspense fallback={null}>
            <ProfileCarouselSection ownerId={profile.id} />
          </Suspense>
        ) : null
      }
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
      places={result.places ?? []}
    />
  );
}

/** Heavy profile body — identity first, places behind nested Suspense. */
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

  const [profile, sessionResult] = await Promise.all([
    lookupPublicProfile(supabase, profileSlug),
    supabase.auth.getSession(),
  ]);
  if (!profile) {
    notFound();
  }

  const isOwner = Boolean(
    sessionResult.data.session?.user.id &&
      sessionResult.data.session.user.id === profile.id,
  );
  const identity = profileViewIdentity(profile, isOwner);

  return (
    <Suspense
      fallback={
        <ProfileView {...identity} gridPending loadError={null} places={[]} />
      }
    >
      <ProfilePlacesBody isOwner={isOwner} profile={profile} />
    </Suspense>
  );
}

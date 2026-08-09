import { notFound } from "next/navigation";

import { AppWordmark } from "@/components/app-wordmark";
import { loadOwnerCarouselPhotos } from "@/lib/experiences/load-owner-carousel-photos";
import { loadOwnerMapPhotos } from "@/lib/experiences/load-owner-map-photos";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import {
  isReservedProfileSlug,
  lookupPublicProfile,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileView } from "../perfil/profile-view";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
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

  const profile = await lookupPublicProfile(supabase, profileSlug);
  if (!profile) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = Boolean(user && user.id === profile.id);

  const [result, mapPhotos, carouselPhotos] = await Promise.all([
    loadOwnerPlaceCards(supabase, profile.id),
    loadOwnerMapPhotos(supabase, profile.id),
    loadOwnerCarouselPhotos(supabase, profile.id),
  ]);

  const displayName = profile.displayName?.trim() || profile.profileSlug;

  return (
    <ProfileView
      avatarPhotoId={profile.avatarPhotoId}
      bio={profile.bio}
      carouselPhotos={carouselPhotos}
      displayName={displayName}
      isOwner={isOwner}
      loadError={
        result.error ? "Não foi possível carregar as viagens deste perfil." : null
      }
      mapPhotos={mapPhotos}
      ownerId={profile.id}
      places={result.places ?? []}
    />
  );
}

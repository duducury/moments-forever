import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppWordmark } from "@/components/app-wordmark";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import {
  isReservedProfileSlug,
  lookupPublicProfile,
  profileAvatarPublicPath,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { absoluteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileView } from "../perfil/profile-view";
import { ProfileCarouselSection } from "./profile-carousel-section";
import { ProfileMapSection } from "./profile-map-section";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly profileSlug: string }>;
}): Promise<Metadata> {
  const { profileSlug: raw } = await params;
  const profileSlug = decodeURIComponent(raw).trim().toLowerCase();
  if (!profileSlug || isReservedProfileSlug(profileSlug)) {
    return { title: "Perfil" };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { title: "Perfil" };
  }

  const profile = await lookupPublicProfile(supabase, profileSlug);
  if (!profile) {
    return { title: "Perfil" };
  }

  const displayName = profile.displayName?.trim() || profile.profileSlug;
  const description =
    profile.bio?.trim() ||
    `Perfil de ${displayName} no Moments Forever.`;
  const profileUrl = absoluteUrl(publicProfilePath(profile.profileSlug));
  const imageUrl = profile.hasPermanentAvatar
    ? absoluteUrl(
        `/api/profile/${encodeURIComponent(profile.profileSlug)}/avatar`,
      )
    : absoluteUrl("/brand/icon-512.png");

  return {
    title: displayName,
    description,
    alternates: { canonical: profileUrl },
    openGraph: {
      type: "profile",
      locale: "pt_BR",
      siteName: "Moments Forever",
      title: displayName,
      description,
      url: profileUrl,
      images: [
        {
          url: imageUrl,
          width: 512,
          height: 512,
          alt: displayName,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: displayName,
      description,
      images: [imageUrl],
    },
  };
}

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

  // Auth does not depend on the profile row — fetch together.
  const [profile, userResult] = await Promise.all([
    lookupPublicProfile(supabase, profileSlug),
    supabase.auth.getUser(),
  ]);
  if (!profile) {
    notFound();
  }

  const user = userResult.data.user;
  const isOwner = Boolean(user && user.id === profile.id);

  // Critical path: place cards only. Destaques + mapa stream below.
  const result = await loadOwnerPlaceCards(supabase, profile.id);

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
      carouselSlot={
        hasPlaces ? (
          <Suspense fallback={null}>
            <ProfileCarouselSection ownerId={profile.id} />
          </Suspense>
        ) : null
      }
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

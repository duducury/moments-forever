import { notFound } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import { buildPassport } from "@/lib/passport/build-passport";
import {
  isReservedProfileSlug,
  lookupPublicProfile,
  profileAvatarPublicPath,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PassaporteClient } from "../../passaporte/passaporte-client";

export const dynamic = "force-dynamic";

/** Public passport for a profile — same content as /passaporte, no login required. */
export default async function PublicProfilePassportPage({
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
    notFound();
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
  const homeHref = publicProfilePath(profile.profileSlug);
  const placesResult = await loadOwnerPlaceCards(supabase, profile.id);
  const places = placesResult.places ?? [];
  const passport = buildPassport(places, null);
  const displayName = profile.displayName?.trim() || profile.profileSlug;

  return (
    <main className="page-shell" data-bottom-nav="true">
      <SignalPwaBootReady />
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
        <AuthStatus hideUserName />
      </nav>
      {placesResult.error ? (
        <p className="placeholder-note" role="alert">
          {placesResult.error}
        </p>
      ) : (
        <PassaporteClient
          avatarPhotoId={profile.avatarPhotoId ?? null}
          avatarRemoteSrc={
            profile.hasPermanentAvatar
              ? profileAvatarPublicPath(profile.profileSlug)
              : null
          }
          bio={profile.bio ?? null}
          displayName={displayName}
          ownerId={profile.id}
          passport={passport}
        />
      )}
      <AppBottomNav
        homeHref={homeHref}
        mapHref={`${homeHref}/mapa`}
        passaporteHref={isOwner ? "/passaporte" : `${homeHref}/passaporte`}
        showCreate={isOwner}
      />
    </main>
  );
}

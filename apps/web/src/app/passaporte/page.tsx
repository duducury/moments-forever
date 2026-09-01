import { redirect } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import { buildPassport } from "@/lib/passport/build-passport";
import {
  ensureOwnerProfileSlug,
  lookupOwnerProfileById,
  profileAvatarPublicPath,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PassaporteClient } from "./passaporte-client";

export const dynamic = "force-dynamic";

export default async function PassaportePage() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
        </nav>
        <section className="narrow">
          <h1>Passaporte</h1>
          <p className="placeholder-note">Supabase local não configurado.</p>
        </section>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Profile + places in parallel — biggest win vs sequential waterfall.
  const [profileResult, placesResult] = await Promise.all([
    lookupOwnerProfileById(supabase, user.id),
    loadOwnerPlaceCards(supabase, user.id),
  ]);

  let profile = profileResult;
  if (!profile?.profileSlug) {
    const slug = await ensureOwnerProfileSlug(
      supabase,
      user.id,
      displayNameFromUser(user),
    );
    profile = await lookupOwnerProfileById(supabase, user.id);
    if (!profile) {
      profile = {
        id: user.id,
        profileSlug: slug,
        displayName: displayNameFromUser(user),
        bio: null,
        avatarPhotoId: null,
        hasPermanentAvatar: false,
      };
    }
  }

  const places = placesResult.places ?? [];
  const passport = buildPassport(places, user.created_at ?? null);
  const displayName =
    profile.displayName?.trim() || displayNameFromUser(user);
  const homeHref = publicProfilePath(profile.profileSlug);

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
          ownerId={user.id}
          passport={passport}
        />
      )}
      <AppBottomNav homeHref={homeHref} mapHref="/mapa" showCreate />
    </main>
  );
}

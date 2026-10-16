import { redirect } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { persistOwnerPlaceCountryCodesAfterResponse } from "@/lib/location/persist-after-response";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import { buildPassport } from "@/lib/passport/build-passport";
import {
  ensureOwnerProfileSlug,
  lookupOwnerProfileById,
  profileAvatarPublicPath,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { pageTimer } from "@/lib/perf/page-timing";
import { peekSessionUserId } from "@/lib/supabase/session-user-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PassaporteClient } from "./passaporte-client";
import { PassportHighlights } from "./passport-highlights";

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

  const timer = pageTimer("passaporte");

  // getUser() is a network call to Supabase Auth and used to run BEFORE any data was requested. The profile and the
  // places only need the owner id, which the session cookie already carries, so they start now, in parallel; the
  // results are used only if getUser() confirms the same user (see session-user-id.ts).
  const sessionUserId = await peekSessionUserId(supabase);
  const early = sessionUserId
    ? Promise.all([
        lookupOwnerProfileById(supabase, sessionUserId),
        loadOwnerPlaceCards(supabase, sessionUserId),
      ])
    : null;
  early?.catch(() => undefined);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  timer.mark("auth");

  if (!user) {
    redirect("/login");
  }

  // Record the country of any place that has none yet (one-time, best-effort) once the page is sent.
  persistOwnerPlaceCountryCodesAfterResponse(supabase, user.id);

  // Profile + places in parallel. Normally already in flight (see above); otherwise start them now.
  const [profileResult, placesResult] =
    early && sessionUserId === user.id
      ? await early
      : await Promise.all([
          lookupOwnerProfileById(supabase, user.id),
          loadOwnerPlaceCards(supabase, user.id),
        ]);
  timer.mark("data");

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

  timer.end();
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
          highlightsSlot={<PassportHighlights ownerId={user.id} />}
          ownerId={user.id}
          passport={passport}
        />
      )}
      <AppBottomNav homeHref={homeHref} mapHref="/mapa" showCreate />
    </main>
  );
}

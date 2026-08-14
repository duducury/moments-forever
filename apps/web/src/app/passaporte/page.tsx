import { redirect } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import { buildPassport } from "@/lib/passport/build-passport";
import {
  ensureOwnerProfileSlug,
  lookupPublicProfile,
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

  const slug = await ensureOwnerProfileSlug(
    supabase,
    user.id,
    displayNameFromUser(user),
  );
  const homeHref = publicProfilePath(slug);
  const profile = await lookupPublicProfile(supabase, slug);
  const result = await loadOwnerPlaceCards(supabase, user.id);
  const places = result.places ?? [];
  const passport = buildPassport(places, user.created_at ?? null);
  const displayName =
    profile?.displayName?.trim() || displayNameFromUser(user);

  return (
    <main className="page-shell" data-bottom-nav="true">
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
        <AuthStatus hideUserName />
      </nav>
      {result.error ? (
        <p className="placeholder-note" role="alert">
          {result.error}
        </p>
      ) : (
        <PassaporteClient
          avatarPhotoId={profile?.avatarPhotoId ?? null}
          bio={profile?.bio ?? null}
          displayName={displayName}
          ownerId={user.id}
          passport={passport}
        />
      )}
      <AppBottomNav homeHref={homeHref} mapHref="/mapa" showCreate />
    </main>
  );
}

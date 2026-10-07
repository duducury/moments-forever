import { redirect } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { isAdminUser } from "@/lib/licensing/require-admin";
import {
  ensureOwnerProfileSlug,
  lookupOwnerProfileById,
  profileAvatarPublicPath,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { GeralSettingsClient } from "./geral-settings-client";

export const dynamic = "force-dynamic";

export default async function GeralPage() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
        </nav>
        <section className="narrow">
          <h1>Geral</h1>
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
  const profile = await lookupOwnerProfileById(supabase, user.id);
  // Same check the profile menu uses; /admin itself is still guarded by
  // requireAdminUser() on every admin page and API route.
  const isAdmin = await isAdminUser(supabase, user.id);

  return (
    <main className="page-shell" data-bottom-nav="true">
      <SignalPwaBootReady />
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
        <AuthStatus hideUserName />
      </nav>
      <GeralSettingsClient
        avatarPhotoId={profile?.avatarPhotoId ?? null}
        avatarRemoteSrc={
          profile?.hasPermanentAvatar ? profileAvatarPublicPath(slug) : null
        }
        isAdmin={isAdmin}
        ownerId={user.id}
        profileBio={profile?.bio ?? null}
        profileName={profile?.displayName?.trim() || slug}
      />
      <AppBottomNav homeHref={homeHref} mapHref="/mapa" showCreate />
    </main>
  );
}

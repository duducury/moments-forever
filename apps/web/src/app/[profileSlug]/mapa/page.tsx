import { notFound } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AuthStatus } from "@/components/auth-status";
import { TripMap } from "@/app/trip/[slug]/trip-map";
import { loadOwnerMapPhotos } from "@/lib/experiences/load-owner-map-photos";
import {
  isReservedProfileSlug,
  lookupPublicProfile,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import styles from "../../mapa/mapa.module.css";

export const dynamic = "force-dynamic";

/** Public full-bleed map for a profile's GPS photos. */
export default async function PublicProfileMapPage({
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

  const profile = await lookupPublicProfile(supabase, profileSlug);
  if (!profile) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = Boolean(user && user.id === profile.id);
  const homeHref = publicProfilePath(profile.profileSlug);
  const photos = await loadOwnerMapPhotos(supabase, profile.id);
  const gpsCount = photos.length;
  const displayName = profile.displayName?.trim() || profile.profileSlug;

  return (
    <main className={styles.page} data-bottom-nav="true">
      <header className={styles.top}>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>Mapa · {displayName}</p>
          <h1 className={styles.title}>
            {gpsCount > 0
              ? `${gpsCount} lugar${gpsCount === 1 ? "" : "es"}`
              : "Sem localizações"}
          </h1>
        </div>
        <AuthStatus />
      </header>

      <div className={styles.stage}>
        <TripMap
          emptyHint="Este perfil ainda não tem fotos com GPS."
          emptyTitle="Mapa vazio por enquanto."
          photos={photos}
          variant="immersive"
        />
      </div>

      <AppBottomNav
        homeHref={homeHref}
        mapHref={`${homeHref}/mapa`}
        passaporteHref={isOwner ? "/passaporte" : `${homeHref}/passaporte`}
        showCreate={isOwner}
      />
    </main>
  );
}

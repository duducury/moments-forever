import { redirect } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AuthStatus } from "@/components/auth-status";
import { TripMap } from "@/app/trip/[slug]/trip-map";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { loadOwnerMapPhotos } from "@/lib/experiences/load-owner-map-photos";
import {
  ensureOwnerProfileSlug,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import styles from "./mapa.module.css";

export const dynamic = "force-dynamic";

/** Full-bleed world map of the signed-in owner's GPS photos (iPhone Maps–like). */
export default async function OwnerMapPage() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className={styles.page}>
        <header className={styles.top}>
          <div className={styles.titleBlock}>
            <p className={styles.eyebrow}>Mapa</p>
            <h1 className={styles.title}>Indisponível</h1>
          </div>
        </header>
        <div className={styles.stage}>
          <p className="placeholder-note">Supabase local não configurado.</p>
        </div>
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
  const photos = await loadOwnerMapPhotos(supabase, user.id);
  const gpsCount = photos.length;

  return (
    <main className={styles.page} data-bottom-nav="true">
      <header className={styles.top}>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>Mapa</p>
          <h1 className={styles.title}>
            {gpsCount > 0
              ? `${gpsCount} lugar${gpsCount === 1 ? "" : "es"} nas suas fotos`
              : "Seus lugares"}
          </h1>
        </div>
        <AuthStatus />
      </header>

      <div className={styles.stage}>
        <TripMap
          emptyHint="Importe fotos com GPS para ver o mundo das suas viagens."
          emptyTitle="Ainda não há localizações no seu mapa."
          photos={photos}
          variant="immersive"
        />
      </div>

      <AppBottomNav homeHref={homeHref} mapHref="/mapa" showCreate />
    </main>
  );
}

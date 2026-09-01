import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import { displayNameFromUser } from "@/lib/auth/display-name";
import {
  ensureOwnerProfileSlug,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PrivacyTripsClient } from "./privacy-trips-client";
import styles from "./privacy.module.css";

export const dynamic = "force-dynamic";

interface PrivacyAlbumRow {
  readonly id: string;
  readonly name: string;
  readonly photoCount: number;
  readonly locatedCount: number;
}

interface PrivacyTripRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly locatedCount: number;
  readonly photoCount: number;
  readonly albums: readonly PrivacyAlbumRow[];
}

export default async function PrivacyPage() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
        </nav>
        <section className="narrow">
          <h1>Privacidade</h1>
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

  const experiences = await supabase
    .from("experiences")
    .select("id, slug, title")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (experiences.error) {
    return (
      <main className="page-shell" data-bottom-nav="true">
        <SignalPwaBootReady />
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
          <AuthStatus />
        </nav>
        <section className="narrow">
          <h1>Privacidade</h1>
          <p className="placeholder-note" role="alert">
            {experiences.error.message}
          </p>
        </section>
        <AppBottomNav homeHref={homeHref} mapHref="/mapa" showCreate />
      </main>
    );
  }

  const rows: PrivacyTripRow[] = [];
  for (const experience of experiences.data ?? []) {
    const [photosResult, albumsResult] = await Promise.all([
      supabase
        .from("photos")
        .select("id, album_id, exact_latitude, exact_longitude")
        .eq("experience_id", experience.id),
      supabase
        .from("albums")
        .select("id, name, parent_album_id, position")
        .eq("experience_id", experience.id)
        .order("position", { ascending: true }),
    ]);

    const photos = photosResult.data ?? [];
    const albums = albumsResult.data ?? [];
    const locatedCount = photos.filter(
      (photo) =>
        photo.exact_latitude !== null && photo.exact_longitude !== null,
    ).length;

    const albumRows: PrivacyAlbumRow[] = albums.map((album) => {
      const albumPhotos = photos.filter((photo) => photo.album_id === album.id);
      const albumLocated = albumPhotos.filter(
        (photo) =>
          photo.exact_latitude !== null && photo.exact_longitude !== null,
      ).length;
      return {
        id: album.id,
        name: album.name?.trim() || "Lugar",
        photoCount: albumPhotos.length,
        locatedCount: albumLocated,
      };
    });

    rows.push({
      id: experience.id,
      slug: experience.slug,
      title: experience.title,
      locatedCount,
      photoCount: photos.length,
      albums: albumRows,
    });
  }

  return (
    <main className="page-shell" data-bottom-nav="true">
      <SignalPwaBootReady />
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
        <AuthStatus />
      </nav>
      <section className="narrow">
        <p className="eyebrow">Geral</p>
        <h1>Privacidade</h1>
        <p className={styles.intro}>
          Algumas fotos podem conter informações de localização. Escolha um
          lugar (álbum), selecione as fotos e remova a localização — ou remova
          de uma viagem inteira.
        </p>

        <h2 className={styles.sectionTitle}>Localização das fotos</h2>
        <p className={styles.sectionLead}>
          Toque em <strong>Escolher fotos</strong> no lugar desejado. No álbum,
          selecione uma ou várias fotos e use{" "}
          <strong>Remover localização</strong>. Também dá para fazer isso
          direto ao abrir uma foto.
        </p>

        <PrivacyTripsClient trips={rows} />

        <p className={styles.back}>
          <Link className="text-link" href="/geral">
            Voltar para Geral
          </Link>
        </p>
      </section>
      <AppBottomNav homeHref={homeHref} mapHref="/mapa" showCreate />
    </main>
  );
}

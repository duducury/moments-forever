import Link from "next/link";

import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { ProfileHomeProvider } from "@/components/profile-home";
import { AlbumFolderView } from "@/app/trip/[slug]/album/[albumId]/album-folder-view";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import { loadTripPageData } from "@/lib/experiences/load-trip-page-data";
import {
  getOwnerProfileSlug,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { profilePath } from "@/lib/routes/app-routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Unified album view — edit controls only when current user owns the experience. */
export default async function ProfileTripAlbumPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{
    readonly tripSlug: string;
    readonly albumId: string;
  }>;
  readonly searchParams: Promise<{ readonly photo?: string }>;
}) {
  const { tripSlug: rawSlug, albumId } = await params;
  const { photo: photoParam } = await searchParams;
  const slug = decodeURIComponent(rawSlug);
  const initialPhotoId = photoParam?.trim() || null;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
        </nav>
        <article className="narrow">
          <h1>Supabase local não configurado</h1>
        </article>
      </main>
    );
  }

  const data = await loadTripPageData(supabase, slug);
  if (!data) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
          <AuthStatus />
        </nav>
        <article className="narrow">
          <h1>Viagem não encontrada</h1>
        </article>
      </main>
    );
  }

  const ownerSlug = await getOwnerProfileSlug(
    supabase,
    data.experience.ownerId,
  );
  const profileHomeHref = ownerSlug ? publicProfilePath(ownerSlug) : null;
  const backHref = profileHomeHref ?? profilePath();

  const album = data.albums.find((item) => item.id === albumId);
  if (!album) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
          <Link className="text-link" href={backHref}>
            Voltar ao perfil
          </Link>
        </nav>
        <article className="narrow">
          <h1>Álbum não encontrado</h1>
        </article>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = Boolean(user && user.id === data.experience.ownerId);

  const placesResult = await loadOwnerPlaceCards(
    supabase,
    data.experience.ownerId,
  );
  const relatedPlaces = (placesResult.places ?? []).filter(
    (place) => place.albumId !== albumId,
  );

  const page = (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
        <AuthStatus />
      </nav>
      <AlbumFolderView
        albumId={albumId}
        albums={data.albums}
        experience={data.experience}
        initialPhotoId={initialPhotoId}
        isOwner={isOwner}
        photos={data.photos}
        profileHomeHref={profileHomeHref}
        relatedPlaces={relatedPlaces}
      />
    </main>
  );

  if (!profileHomeHref) return page;

  return (
    <ProfileHomeProvider homeHref={profileHomeHref}>{page}</ProfileHomeProvider>
  );
}

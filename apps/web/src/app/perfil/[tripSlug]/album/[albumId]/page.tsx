import Link from "next/link";
import { Suspense } from "react";

import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { ProfileHomeProvider } from "@/components/profile-home";
import { AlbumFolderView } from "@/app/trip/[slug]/album/[albumId]/album-folder-view";
import { loadTripPageData } from "@/lib/experiences/load-trip-page-data";
import {
  getOwnerProfileSlug,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { profilePath } from "@/lib/routes/app-routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { AlbumRelatedPlaces } from "./album-related-places";

/** Unified album view — edit controls only when current user owns the experience. */
export default async function ProfileTripAlbumPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{
    readonly tripSlug: string;
    readonly albumId: string;
  }>;
  readonly searchParams: Promise<{
    readonly photo?: string;
    readonly privacy?: string;
  }>;
}) {
  const { tripSlug: rawSlug, albumId } = await params;
  const { photo: photoParam, privacy: privacyParam } = await searchParams;
  const slug = decodeURIComponent(rawSlug);
  const initialPhotoId = photoParam?.trim() || null;
  const initialPrivacyMode =
    privacyParam === "1" || privacyParam?.toLowerCase() === "true";
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

  // Auth does not depend on trip data — fetch in parallel with the album payload.
  const [data, userResult] = await Promise.all([
    loadTripPageData(supabase, slug),
    supabase.auth.getUser(),
  ]);
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

  const user = userResult.data.user;
  const isOwner = Boolean(user && user.id === data.experience.ownerId);

  const page = (
    <main className="page-shell" data-bottom-nav="true">
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
        <AuthStatus albumId={albumId} />
      </nav>
      <AlbumFolderView
        albumId={albumId}
        albums={data.albums}
        experience={data.experience}
        initialPhotoId={initialPhotoId}
        initialPrivacyMode={initialPrivacyMode}
        isOwner={isOwner}
        photos={data.photos}
        profileHomeHref={profileHomeHref}
        relatedPlacesSlot={
          <Suspense fallback={null}>
            <AlbumRelatedPlaces
              excludeAlbumId={albumId}
              ownerId={data.experience.ownerId}
            />
          </Suspense>
        }
      />
    </main>
  );

  if (!profileHomeHref) return page;

  return (
    <ProfileHomeProvider homeHref={profileHomeHref}>{page}</ProfileHomeProvider>
  );
}

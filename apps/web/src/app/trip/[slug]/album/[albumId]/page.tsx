import { redirect } from "next/navigation";

import { profileTripAlbumPath } from "@/lib/routes/app-routes";

/** Legacy album URL → unified album view under /perfil. */
export default async function LegacyTripAlbumRedirectPage({
  params,
}: {
  readonly params: Promise<{
    readonly slug: string;
    readonly albumId: string;
  }>;
}) {
  const { slug, albumId } = await params;
  redirect(
    profileTripAlbumPath(decodeURIComponent(slug), decodeURIComponent(albumId)),
  );
}

import { redirect } from "next/navigation";

import { profileTripAlbumPath } from "@/lib/routes/app-routes";

/**
 * Compatibility: Admin album URLs open the same unified album view under /perfil.
 */
export default async function AdminTripAlbumRedirectPage({
  params,
}: {
  readonly params: Promise<{
    readonly slug: string;
    readonly albumId: string;
  }>;
}) {
  const { slug, albumId } = await params;
  redirect(profileTripAlbumPath(decodeURIComponent(slug), albumId));
}

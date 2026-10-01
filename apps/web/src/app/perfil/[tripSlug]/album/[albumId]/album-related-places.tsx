import { SeeAlsoPlaces } from "@/app/perfil/see-also-places";
import { loadOwnerPlaceCards } from "@/lib/experiences/load-owner-place-cards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Streams below the album fold — must not block hero + gallery HTML.
 */
export async function AlbumRelatedPlaces({
  ownerId,
  excludeAlbumId,
  isOwner,
}: {
  readonly ownerId: string;
  readonly excludeAlbumId: string;
  readonly isOwner: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const placesResult = await loadOwnerPlaceCards(supabase, ownerId, {
    publicOnly: !isOwner,
  });
  const relatedPlaces = (placesResult.places ?? []).filter(
    (place) => place.albumId !== excludeAlbumId,
  );

  return <SeeAlsoPlaces places={relatedPlaces} />;
}

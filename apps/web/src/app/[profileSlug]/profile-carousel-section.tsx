import { loadOwnerCarouselPhotos } from "@/lib/experiences/load-owner-carousel-photos";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileCarousel } from "../perfil/profile-carousel";

/** Streams below the header — must not block place cards HTML. */
export async function ProfileCarouselSection({
  ownerId,
}: {
  readonly ownerId: string;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const photos = await loadOwnerCarouselPhotos(supabase, ownerId);
  return <ProfileCarousel photos={photos} />;
}

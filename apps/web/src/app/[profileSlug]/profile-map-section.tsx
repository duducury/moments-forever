import { loadOwnerMapPhotos } from "@/lib/experiences/load-owner-map-photos";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileMap } from "../perfil/profile-map";

/**
 * Streams at the bottom of the profile — GPS query + MapLibre must not
 * delay the place grid above.
 */
export async function ProfileMapSection({
  ownerId,
}: {
  readonly ownerId: string;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const photos = await loadOwnerMapPhotos(supabase, ownerId);
  return <ProfileMap photos={photos} />;
}

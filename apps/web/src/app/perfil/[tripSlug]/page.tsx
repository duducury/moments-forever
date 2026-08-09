import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";

/**
 * A página de viagem completa foi removida.
 * O app usa só /perfil → pasta (/perfil/[slug]/album/[id]).
 */
export default function ProfileTripRedirectPage() {
  redirect(profilePath());
}

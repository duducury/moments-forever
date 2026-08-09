import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";

/** Legacy /trip/[slug] → perfil (sem página de viagem completa). */
export default function LegacyTripRedirectPage() {
  redirect(profilePath());
}

import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";

/** Compatibilidade: sem UI de viagem completa. */
export default function AdminTripRedirectPage() {
  redirect(profilePath());
}

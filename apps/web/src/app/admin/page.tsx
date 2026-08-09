import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";

/**
 * Compatibilidade: Admin não é mais uma UI separada.
 * O dono edita no próprio perfil (/perfil) e nas viagens unificadas.
 */
export default function AdminRedirectPage() {
  redirect(profilePath());
}

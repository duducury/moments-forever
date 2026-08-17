import { PwaLoadingShell } from "@/components/pwa-loading-shell";

import { PerfilEntryRedirect } from "./perfil-entry-redirect";

/** PWA start_url — must paint instantly; redirect happens on the client. */
export default function PerfilPage() {
  return (
    <>
      <PwaLoadingShell hint="Abrindo seu perfil…" />
      <PerfilEntryRedirect />
    </>
  );
}

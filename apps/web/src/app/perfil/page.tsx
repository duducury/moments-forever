import { AppBootSplash } from "@/components/app-boot-splash";
import { PerfilEntryRedirect } from "./perfil-entry-redirect";

/** PWA start_url — paint the brand immediately; redirect on the client. */
export default function PerfilPage() {
  return (
    <>
      <AppBootSplash hint="Abrindo sua coleção…" />
      <PerfilEntryRedirect />
    </>
  );
}

import { redirect } from "next/navigation";

import { profilePath } from "@/lib/routes/app-routes";

/** Legacy route — management lives on the profile. */
export default function ViagensRedirectPage() {
  redirect(profilePath());
}

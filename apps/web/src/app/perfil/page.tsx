import { redirect } from "next/navigation";

import { AppWordmark } from "@/components/app-wordmark";
import { displayNameFromUser } from "@/lib/auth/display-name";
import {
  ensureOwnerProfileSlug,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Owner entry: ensure public slug, then redirect to /{nome}. */
export default async function MyProfileRedirectPage() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
        </nav>
        <section className="narrow">
          <h1>Supabase local não configurado</h1>
        </section>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const slug = await ensureOwnerProfileSlug(
    supabase,
    user.id,
    displayNameFromUser(user),
  );

  redirect(publicProfilePath(slug));
}

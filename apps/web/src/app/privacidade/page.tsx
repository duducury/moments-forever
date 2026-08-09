import Link from "next/link";
import { redirect } from "next/navigation";

import { AppWordmark } from "@/components/app-wordmark";
import { AuthStatus } from "@/components/auth-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PrivacyTripsClient } from "./privacy-trips-client";

export const dynamic = "force-dynamic";

interface PrivacyTripRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly locatedCount: number;
  readonly photoCount: number;
}

export default async function PrivacyPage() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
        </nav>
        <section className="narrow">
          <h1>Privacidade</h1>
          <p className="placeholder-note">Supabase local não configurado.</p>
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

  const experiences = await supabase
    .from("experiences")
    .select("id, slug, title")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (experiences.error) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Navegação">
          <AppWordmark />
          <AuthStatus />
        </nav>
        <section className="narrow">
          <h1>Privacidade</h1>
          <p className="placeholder-note" role="alert">
            {experiences.error.message}
          </p>
        </section>
      </main>
    );
  }

  const rows: PrivacyTripRow[] = [];
  for (const experience of experiences.data ?? []) {
    const photos = await supabase
      .from("photos")
      .select("id, exact_latitude, exact_longitude")
      .eq("experience_id", experience.id);

    const list = photos.data ?? [];
    const locatedCount = list.filter(
      (photo) =>
        photo.exact_latitude !== null && photo.exact_longitude !== null,
    ).length;

    rows.push({
      id: experience.id,
      slug: experience.slug,
      title: experience.title,
      locatedCount,
      photoCount: list.length,
    });
  }

  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
        <AuthStatus />
      </nav>
      <section className="narrow">
        <p className="eyebrow">Conta</p>
        <h1>Privacidade</h1>
        <p style={{ marginTop: 16, color: "var(--muted)", lineHeight: 1.55 }}>
          Algumas fotos podem conter informações de localização. Você pode
          remover a localização de fotos a qualquer momento.
        </p>

        <h2 style={{ marginTop: 32, fontSize: "1.15rem" }}>
          Localização das fotos
        </h2>
        <p style={{ marginTop: 8, color: "var(--muted)", lineHeight: 1.5 }}>
          Remova a localização de fotos selecionadas na organização do álbum, ou
          de uma viagem inteira abaixo.
        </p>

        <PrivacyTripsClient trips={rows} />

        <p style={{ marginTop: 28 }}>
          <Link className="text-link" href="/perfil">
            Voltar ao perfil
          </Link>
        </p>
      </section>
    </main>
  );
}

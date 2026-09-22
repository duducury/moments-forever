import { redirect } from "next/navigation";

import { AppWordmark } from "@/components/app-wordmark";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function NotLinkedPage() {
  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
      </nav>
      <section className="narrow" style={{ textAlign: "center" }}>
        <h1>Esta tag ainda não foi vinculada a uma viagem.</h1>
        <p className="lead">
          Assim que o dono desta tag escolher uma viagem, este link vai levar
          direto até ela.
        </p>
      </section>
    </main>
  );
}

/**
 * Public NFC tag redirect. resolve_nfc_token() only ever returns a trip id
 * (or null) — it never exposes the nfc_tags row itself. Whether that trip is
 * actually visible to this visitor is then decided by the normal RLS
 * policies on `experiences`/`albums`, exactly like every other public page.
 */
export default async function NfcTagPage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw).trim();
  if (!token) return <NotLinkedPage />;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return <NotLinkedPage />;

  const resolved = await supabase.rpc("resolve_nfc_token", { p_token: token });
  const experienceId = resolved.data as string | null;
  if (resolved.error || !experienceId) return <NotLinkedPage />;

  const experience = await supabase
    .from("experiences")
    .select("slug")
    .eq("id", experienceId)
    .maybeSingle();
  if (experience.error || !experience.data?.slug) return <NotLinkedPage />;

  const slug = experience.data.slug as string;

  const firstAlbum = await supabase
    .from("albums")
    .select("id")
    .eq("experience_id", experienceId)
    .is("parent_album_id", null)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstAlbum.error || !firstAlbum.data?.id) return <NotLinkedPage />;

  redirect(profileTripAlbumPath(slug, firstAlbum.data.id as string));
}

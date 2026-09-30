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
 * Public NFC tag redirect. resolve_nfc_token() returns the exact
 * {trip_id, album_id} the tag was linked to — never the nfc_tags row itself
 * — so this redirects straight to that specific album, the same one the
 * owner selected when they created the tag. It never re-derives "the first
 * root album of this experience": that used to be the resolution rule here,
 * and it could silently disagree with which album was actually linked
 * whenever an experience has more than one root album (e.g. "Dubai" and
 * "Bali" as two destinations under the same import trip). Whether the
 * resolved trip/album is actually visible to this visitor is then decided by
 * the normal RLS policies on `experiences`/`albums`, exactly like every other
 * public page.
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
  const row = (
    resolved.data as
      | readonly { readonly trip_id: string; readonly album_id: string }[]
      | null
  )?.[0];
  if (resolved.error || !row?.trip_id || !row.album_id) {
    return <NotLinkedPage />;
  }

  const experience = await supabase
    .from("experiences")
    .select("slug")
    .eq("id", row.trip_id)
    .maybeSingle();
  if (experience.error || !experience.data?.slug) return <NotLinkedPage />;

  redirect(profileTripAlbumPath(experience.data.slug as string, row.album_id));
}

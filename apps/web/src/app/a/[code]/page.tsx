import { notFound, redirect } from "next/navigation";

import { profileTripAlbumPath } from "@/lib/routes/app-routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Short, NFC-tag-friendly album link (moments-forever-web.vercel.app/a/{code}).
 * RLS governs the lookup exactly like the full album URL does — this route
 * adds no new access, it just resolves a short code to the real path.
 */
export default async function ShortAlbumLinkPage({
  params,
}: {
  readonly params: Promise<{ readonly code: string }>;
}) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).trim().toLowerCase();
  if (!code) notFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const album = await supabase
    .from("albums")
    .select("id, experience_id")
    .eq("short_code", code)
    .maybeSingle();
  if (album.error || !album.data) notFound();

  const experience = await supabase
    .from("experiences")
    .select("slug")
    .eq("id", album.data.experience_id as string)
    .maybeSingle();
  if (experience.error || !experience.data?.slug) notFound();

  redirect(
    profileTripAlbumPath(
      experience.data.slug as string,
      album.data.id as string,
    ),
  );
}

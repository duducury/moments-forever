import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

/**
 * Photos require a moment_id. Albums from import already have source_moment_id.
 * For manually created albums, create a moment, remove the empty album the
 * trigger auto-creates, and link the existing album to that moment.
 */
export async function ensureAlbumMomentId(
  supabase: ServerSupabase,
  experienceId: string,
  album: {
    readonly id: string;
    readonly name: string;
    readonly source_moment_id: string | null;
  },
): Promise<{ readonly momentId: string; readonly error?: string }> {
  if (album.source_moment_id) {
    return { momentId: album.source_moment_id };
  }

  const maxMoment = await supabase
    .from("moments")
    .select("position")
    .eq("experience_id", experienceId)
    .order("position", { ascending: false })
    .limit(1);

  if (maxMoment.error) {
    return { momentId: "", error: maxMoment.error.message };
  }

  const nextPosition = (maxMoment.data?.[0]?.position ?? 0) + 1;
  const created = await supabase
    .from("moments")
    .insert({
      experience_id: experienceId,
      title: album.name,
      position: nextPosition,
      confirmed_by_user: true,
    })
    .select("id")
    .single();

  if (created.error || !created.data) {
    return {
      momentId: "",
      error: created.error?.message ?? "Falha ao criar momento do lugar.",
    };
  }

  const momentId = created.data.id as string;

  // Trigger created an empty root album for this moment — remove it.
  const autoAlbum = await supabase
    .from("albums")
    .select("id")
    .eq("source_moment_id", momentId)
    .eq("experience_id", experienceId)
    .maybeSingle();

  if (autoAlbum.data && autoAlbum.data.id !== album.id) {
    await supabase.from("albums").delete().eq("id", autoAlbum.data.id);
  }

  const linked = await supabase
    .from("albums")
    .update({ source_moment_id: momentId })
    .eq("id", album.id)
    .eq("experience_id", experienceId);

  if (linked.error) {
    return { momentId: "", error: linked.error.message };
  }

  return { momentId };
}

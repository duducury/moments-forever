import { NextResponse } from "next/server";

import { loadOwnerExperiences } from "@/lib/experiences/load-owner-experiences";
import { getUserLicense } from "@/lib/licensing/get-user-license";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function nfcUrl(token: string): string {
  return `${getSiteUrl()}/n/${token}`;
}

/** All of the owner's trips + their NFC tag status, for the "Ativar NFC" list. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase local não configurado." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [{ experiences, error }, license] = await Promise.all([
    loadOwnerExperiences(supabase, user.id),
    getUserLicense(supabase, user.id),
  ]);

  if (error || !experiences) {
    return NextResponse.json(
      { error: error ?? "Não foi possível carregar as viagens." },
      { status: 400 },
    );
  }

  const experienceIds = experiences.map((experience) => experience.id);
  const tags =
    experienceIds.length > 0
      ? await supabase
          .from("nfc_tags")
          .select("trip_id, token")
          .eq("user_id", user.id)
          .in("trip_id", experienceIds)
      : { data: [] as Array<{ trip_id: string; token: string }> };

  const tokenByExperienceId = new Map(
    (tags.data ?? []).map((row) => [
      row.trip_id as string,
      row.token as string,
    ]),
  );

  return NextResponse.json({
    trips: experiences.map((experience) => {
      const token = tokenByExperienceId.get(experience.id) ?? null;
      return {
        experienceId: experience.id,
        title: experience.title,
        coverPhotoId: experience.coverPhotoId,
        photoCount: experience.photoCount,
        nfcToken: token,
        nfcUrl: token ? nfcUrl(token) : null,
      };
    }),
    usedCount: tokenByExperienceId.size,
    maxNfcTags: license?.maxNfcTags ?? null,
  });
}

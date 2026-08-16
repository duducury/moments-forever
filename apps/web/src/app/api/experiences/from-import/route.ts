import { NextResponse } from "next/server";

import type { ImportOrganizationPlan } from "@moments-forever/shared";
import type { ExperienceImportDraft } from "@moments-forever/types";

import {
  applyNestedImportOrganization,
  renameSingleRootAlbum,
} from "@/lib/experiences/apply-import-organization";
import { createExperienceFromImport } from "@/lib/experiences/create-experience-from-import";
import {
  buildSeedCacheFromPlaces,
  enrichImportDraftPlaces,
} from "@/lib/location/resolve-place-labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseOrganization(
  value: unknown,
): ImportOrganizationPlan | null {
  if (!value || typeof value !== "object") return null;
  const plan = value as Partial<ImportOrganizationPlan>;
  if (
    plan.mode !== "separate" &&
    plan.mode !== "single" &&
    plan.mode !== "nested"
  ) {
    return null;
  }
  if (typeof plan.rootName !== "string") return null;
  const children = Array.isArray(plan.children)
    ? plan.children.flatMap((child) => {
        if (!child || typeof child !== "object") return [];
        const groupId =
          typeof child.groupId === "string" ? child.groupId : "";
        const name = typeof child.name === "string" ? child.name : "";
        const photoIds = Array.isArray(child.photoIds)
          ? child.photoIds.filter(
              (id: unknown): id is string => typeof id === "string",
            )
          : [];
        if (!groupId || photoIds.length === 0) return [];
        return [{ groupId, name, photoIds }];
      })
    : [];
  return {
    mode: plan.mode,
    rootName: plan.rootName,
    children,
  };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase local não configurado." },
      { status: 503 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const draft = (body as { draft?: ExperienceImportDraft }).draft;
  const organization = parseOrganization(
    (body as { organization?: unknown }).organization,
  );

  if (!draft?.experience || !draft.moments || !draft.photos) {
    return NextResponse.json({ error: "Draft inválido." }, { status: 400 });
  }

  if (draft.experience.ownerId !== user.id) {
    return NextResponse.json(
      { error: "ownerId não corresponde ao usuário autenticado." },
      { status: 403 },
    );
  }

  try {
    const knownPlaces = await supabase
      .from("places")
      .select("name, exact_latitude, exact_longitude")
      .not("exact_latitude", "is", null)
      .not("exact_longitude", "is", null)
      .limit(200);

    const seedCache = buildSeedCacheFromPlaces(
      (knownPlaces.data ?? []).map((place) => ({
        name: place.name as string,
        exactLatitude: (place.exact_latitude as number | null) ?? null,
        exactLongitude: (place.exact_longitude as number | null) ?? null,
      })),
    );

    const { draft: enrichedDraft } = await enrichImportDraftPlaces(draft, {
      seedCache,
    });

    const albumStory =
      typeof (body as { albumStory?: unknown }).albumStory === "string"
        ? (body as { albumStory: string }).albumStory
        : "";

    const result = await createExperienceFromImport(enrichedDraft, supabase);

    const mode = organization?.mode ?? "separate";
    if (mode === "nested" && organization) {
      await applyNestedImportOrganization(supabase, result.id, organization);
    } else if (mode === "single" && organization?.rootName) {
      await renameSingleRootAlbum(
        supabase,
        result.id,
        organization.rootName,
        albumStory,
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao criar experiência.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

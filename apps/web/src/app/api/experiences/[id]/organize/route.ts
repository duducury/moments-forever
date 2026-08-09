import { NextResponse } from "next/server";

import type { ImportOrganizationPlan } from "@moments-forever/shared";

import { organizeExperienceAlbums } from "@/lib/experiences/organize-experience-albums";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseOrganization(value: unknown): ImportOrganizationPlan | null {
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

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id: experienceId } = await context.params;
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

  const owned = await supabase
    .from("experiences")
    .select("id")
    .eq("id", experienceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (owned.error || !owned.data) {
    return NextResponse.json(
      { error: "Experiência não encontrada." },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const organization = parseOrganization(
    (body as { organization?: unknown }).organization ?? body,
  );
  if (!organization) {
    return NextResponse.json(
      { error: "Organização inválida." },
      { status: 400 },
    );
  }

  try {
    await organizeExperienceAlbums(supabase, experienceId, organization);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível organizar os lugares.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";

import { isReservedProfileSlug } from "@/lib/profile/profile-slug";
import { absoluteUrl } from "@/lib/site-url";
import { getR2Config, getR2ObjectBytes } from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function brandIconRedirect() {
  return NextResponse.redirect(absoluteUrl("/brand/icon-512.png"), 302);
}

/**
 * Public avatar bytes for share previews (WhatsApp / Open Graph).
 * Readable when the profile slug is public — no session required.
 */
export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly slug: string }> },
) {
  const { slug: raw } = await context.params;
  const slug = decodeURIComponent(raw).trim().toLowerCase();
  if (!slug || isReservedProfileSlug(slug)) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }

  if (!getR2Config()) {
    return brandIconRedirect();
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase local não configurado." },
      { status: 503 },
    );
  }

  const result = await supabase
    .from("users")
    .select("avatar_storage_key")
    .eq("profile_slug", slug)
    .maybeSingle();

  const key =
    (result.data?.avatar_storage_key as string | null)?.trim() || null;
  if (!key) {
    return brandIconRedirect();
  }

  const object = await getR2ObjectBytes({ key });
  if (!object) {
    return brandIconRedirect();
  }

  return new NextResponse(Buffer.from(object.body), {
    status: 200,
    headers: {
      "content-type": object.contentType,
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

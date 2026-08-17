import { NextResponse } from "next/server";

import { displayNameFromUser } from "@/lib/auth/display-name";
import {
  ensureOwnerProfileSlug,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Resolves where the PWA home-screen entry (/perfil) should land. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ redirect: "/login" });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ redirect: "/login" });
  }

  try {
    const slug = await ensureOwnerProfileSlug(
      supabase,
      user.id,
      displayNameFromUser(user),
    );
    return NextResponse.json({ redirect: publicProfilePath(slug) });
  } catch {
    return NextResponse.json({ redirect: "/login" }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { resolveAuthCallback } from "@/lib/auth/auth-callback";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const destination = await resolveAuthCallback(request.url, {
    createClient: createSupabaseServerClient,
    hasVerifierCookie: request.cookies.getAll().some((cookie) => cookie.name.endsWith("-code-verifier")),
    warn: (message) => console.warn(message),
  });
  return NextResponse.redirect(destination);
}

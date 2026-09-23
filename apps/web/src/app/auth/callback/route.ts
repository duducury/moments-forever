import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where OAuth can send the browser back to. Allowlisted (not just "any
 * relative path") so a crafted `next` value can never turn this into an
 * open redirect.
 */
const ALLOWED_NEXT_PATHS = new Set(["/login", "/ativar"]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const nextPath = nextParam && ALLOWED_NEXT_PATHS.has(nextParam) ? nextParam : "/login";
  const destination = new URL(nextPath, url.origin);

  if (!code) {
    destination.searchParams.set("error", "missing_code");
    return NextResponse.redirect(destination);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    destination.searchParams.set("error", "supabase_not_configured");
    return NextResponse.redirect(destination);
  }

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    destination.searchParams.set("error", "auth_callback_failed");
  }

  return NextResponse.redirect(destination);
}

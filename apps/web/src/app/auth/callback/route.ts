import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = new URL("/login", url.origin);

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

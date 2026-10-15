import { NextResponse } from "next/server";

import {
  describePlaceCardsComparison,
  loadOwnerPlaceCardsJoined,
  loadOwnerPlaceCardsSequential,
} from "@/lib/experiences/load-owner-place-cards";
import { perfLogEnabled, placeCardsJoinMode } from "@/lib/perf/flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * One request that answers, without any log viewer, what this deployment is really doing:
 *   - which commit, Vercel environment and function region it runs in, and which switches (PERF_LOG,
 *     PLACE_CARDS_JOIN) the running code actually sees;
 *   - the real round trip from this function to Supabase;
 *   - how long the sequential and the joined place-card loaders take for the SIGNED-IN person, and whether
 *     they return the same cards (verdict only; the reason when the joined read is refused).
 *
 * Safety: it never answers in Production (404), needs a signed-in session, only reads the caller's own rows (row
 * level security applies), and returns durations, counts and flag values: no ids, tokens, names or photo data.
 * Open it in the browser on the Preview while signed in: https://<preview>/api/diag/nav
 */
export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const noStore = { "cache-control": "no-store" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503, headers: noStore });
  }

  const authStart = Date.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authMs = Date.now() - authStart;
  if (!user) {
    return NextResponse.json({ error: "Sign in first, then reload this page" }, { status: 401, headers: noStore });
  }

  // Raw function -> Supabase round trip: a one-row read, three times (the first one pays the connection set-up).
  const roundTripsMs: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const start = Date.now();
    await supabase.from("users").select("id").eq("id", user.id).maybeSingle();
    roundTripsMs.push(Date.now() - start);
  }

  const sequentialMs: number[] = [];
  const joinedMs: number[] = [];
  let sequential = await loadOwnerPlaceCardsSequential(supabase, user.id);
  let joined: Awaited<ReturnType<typeof loadOwnerPlaceCardsJoined>> = null;
  let why: string | null = null;
  for (let i = 0; i < 2; i += 1) {
    let start = Date.now();
    sequential = await loadOwnerPlaceCardsSequential(supabase, user.id);
    sequentialMs.push(Date.now() - start);
    start = Date.now();
    joined = await loadOwnerPlaceCardsJoined(supabase, user.id, undefined, (reason) => (why = reason));
    joinedMs.push(Date.now() - start);
  }

  const verdict = describePlaceCardsComparison(sequential, joined);
  return NextResponse.json(
    {
      deployment: {
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        vercelEnv: process.env.VERCEL_ENV ?? null,
        functionRegion: process.env.VERCEL_REGION ?? null,
        node: process.version,
      },
      flagsSeenByTheRunningCode: { PERF_LOG: perfLogEnabled(), PLACE_CARDS_JOIN: placeCardsJoinMode() },
      supabaseRoundTripMs: roundTripsMs,
      authMs,
      placeCards: {
        cards: sequential.places?.length ?? null,
        sequentialMs,
        joinedMs,
        verdict,
        joinedRefusedBecause: joined === null ? why : null,
      },
      howToRead:
        "supabaseRoundTripMs is the real function->database latency (about 70 ms for iad1 -> us-west-2, about 5 ms in the same region). " +
        "Each sequential load costs about 3 of those round trips, the joined load about 1. verdict must be 'equal' (or 'order-differs') before PLACE_CARDS_JOIN=1.",
    },
    { headers: noStore },
  );
}

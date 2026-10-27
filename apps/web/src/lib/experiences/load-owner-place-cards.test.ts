import assert from "node:assert/strict";
import test from "node:test";

import { describePlaceCardsComparison, loadOwnerPlaceCards } from "./load-owner-place-cards";

type Call = { readonly method: string; readonly args: readonly unknown[] };

/**
 * Minimal chainable Supabase query-builder fake. Stage 1 of
 * loadOwnerPlaceCards always resolves with an empty experiences list here,
 * so the function returns early — exactly enough to assert on which
 * .eq(...) filters it applied before resolving.
 */
function fakeSupabase(calls: Call[]) {
  function builder() {
    const self = {
      select(...args: unknown[]) {
        calls.push({ method: "select", args });
        return self;
      },
      eq(...args: unknown[]) {
        calls.push({ method: "eq", args });
        return self;
      },
      order(...args: unknown[]) {
        calls.push({ method: "order", args });
        return Promise.resolve({ data: [], error: null });
      },
    };
    return self;
  }
  return { from: () => builder() } as unknown as Parameters<
    typeof loadOwnerPlaceCards
  >[0];
}

test("publicOnly: true filters experiences to public + published", async () => {
  const calls: Call[] = [];
  const supabase = fakeSupabase(calls);
  await loadOwnerPlaceCards(supabase, "owner-1", { publicOnly: true });
  const eqCalls = calls
    .filter((call) => call.method === "eq")
    .map((call) => call.args);
  assert.deepEqual(eqCalls, [
    ["owner_id", "owner-1"],
    ["visibility", "public"],
    ["status", "published"],
  ]);
});

test("publicOnly omitted preserves current behavior (owner-only filter)", async () => {
  const calls: Call[] = [];
  const supabase = fakeSupabase(calls);
  await loadOwnerPlaceCards(supabase, "owner-1");
  const eqCalls = calls
    .filter((call) => call.method === "eq")
    .map((call) => call.args);
  assert.deepEqual(eqCalls, [["owner_id", "owner-1"]]);
});

test("publicOnly: false behaves the same as omitted", async () => {
  const calls: Call[] = [];
  const supabase = fakeSupabase(calls);
  await loadOwnerPlaceCards(supabase, "owner-1", { publicOnly: false });
  const eqCalls = calls
    .filter((call) => call.method === "eq")
    .map((call) => call.args);
  assert.deepEqual(eqCalls, [["owner_id", "owner-1"]]);
});

// ---------------------------------------------------------------------------
// Joined loader (PLACE_CARDS_JOIN): same answer as the sequential one, in one round of queries.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function dataSupabase(
  data: { readonly albums: Row[]; readonly photos: Row[]; readonly focus: Row[] },
  log: { tables: string[]; eqs: unknown[][]; albumsError?: boolean },
) {
  const experiences: Row[] = [{ id: "ex1", slug: "viagem", title: "Viagem" }];
  function builder(table: string) {
    const state = { error: null as null | { message: string } };
    const self = {
      select: () => self,
      eq: (...args: unknown[]) => {
        log.eqs.push(args);
        return self;
      },
      in: () => self,
      is: () => self,
      order: () => self,
      then: (resolve: (value: unknown) => void) => {
        let rows: Row[] = [];
        if (table === "experiences") rows = experiences;
        if (table === "albums") {
          if (log.albumsError && log.tables.filter((t) => t === "albums").length === 1) {
            state.error = { message: "embed not available" };
          }
          rows = data.albums;
        }
        if (table === "photos") rows = data.photos;
        if (table === "album_cover_focus") rows = data.focus;
        resolve({ data: state.error ? null : rows, error: state.error });
      },
    };
    return self;
  }
  return {
    from: (table: string) => {
      log.tables.push(table);
      return builder(table);
    },
  } as unknown as Parameters<typeof loadOwnerPlaceCards>[0];
}

const SAMPLE = {
  albums: [
    { id: "al1", experience_id: "ex1", name: "Local 1", cover_photo_id: "ph1", position: 0, source_moment_id: null, moment: null, experiences: { slug: "viagem", title: "Viagem" } },
    { id: "al2", experience_id: "ex1", name: "Paris", cover_photo_id: null, position: 1, source_moment_id: "m2", moment: { place: { name: "Paris, França", confirmed_by_user: true, country_code: "FR" } }, experiences: { slug: "viagem", title: "Viagem" } },
  ],
  photos: [
    { album_id: "al1", captured_at: "2024-05-02T10:00:00Z" },
    { album_id: "al1", captured_at: "2024-05-01T10:00:00Z" },
    { album_id: "al2", captured_at: "2024-06-10T10:00:00Z" },
    { album_id: null, captured_at: null },
  ],
  focus: [{ album_id: "al1", focus_x: 30, focus_y: 70, focus_zoom: 1.5 }],
};

async function withMode<T>(mode: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env.PLACE_CARDS_JOIN;
  if (mode === undefined) delete process.env.PLACE_CARDS_JOIN;
  else process.env.PLACE_CARDS_JOIN = mode;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PLACE_CARDS_JOIN;
    else process.env.PLACE_CARDS_JOIN = previous;
  }
}

test("joined loader returns exactly what the sequential loader returns, with one round of 3 parallel queries", async () => {
  const seqLog = { tables: [] as string[], eqs: [] as unknown[][] };
  const sequential = await withMode(undefined, () => loadOwnerPlaceCards(dataSupabase(SAMPLE, seqLog), "owner-1"));
  const joinLog = { tables: [] as string[], eqs: [] as unknown[][] };
  const joined = await withMode("1", () => loadOwnerPlaceCards(dataSupabase(SAMPLE, joinLog), "owner-1"));

  assert.deepEqual(joined, sequential);
  assert.equal(joined.places?.length, 2);
  assert.deepEqual(joinLog.tables, ["albums", "photos", "album_cover_focus"], "no experiences query to wait for");
  assert.ok(seqLog.tables.length >= 4 && seqLog.tables[0] === "experiences");
  assert.deepEqual(
    joinLog.eqs.filter((eq) => String(eq[0]).includes("owner_id")),
    [["experiences.owner_id", "owner-1"], ["experiences.owner_id", "owner-1"], ["albums.experiences.owner_id", "owner-1"]],
  );
});

test("joined loader keeps the public-only filter (visibility + status) on albums and photos", async () => {
  const log = { tables: [] as string[], eqs: [] as unknown[][] };
  await withMode("1", () => loadOwnerPlaceCards(dataSupabase(SAMPLE, log), "owner-1", { publicOnly: true }));
  const publicEqs = log.eqs.filter((eq) => String(eq[0]) === "experiences.visibility" || String(eq[0]) === "experiences.status");
  assert.deepEqual(publicEqs, [
    ["experiences.visibility", "public"],
    ["experiences.status", "published"],
    ["experiences.visibility", "public"],
    ["experiences.status", "published"],
  ]);
});

test("when the joined read fails it falls back to the sequential loader and still answers correctly", async () => {
  const log = { tables: [] as string[], eqs: [] as unknown[][], albumsError: true };
  const expected = await withMode(undefined, () =>
    loadOwnerPlaceCards(dataSupabase(SAMPLE, { tables: [], eqs: [] }), "owner-1"),
  );
  const result = await withMode("1", () => loadOwnerPlaceCards(dataSupabase(SAMPLE, log), "owner-1"));
  assert.deepEqual(result, expected);
  assert.ok(log.tables.includes("experiences"), "the sequential path ran");
});

test("compare mode returns the sequential result", async () => {
  const sequential = await withMode(undefined, () =>
    loadOwnerPlaceCards(dataSupabase(SAMPLE, { tables: [], eqs: [] }), "owner-1"),
  );
  const compared = await withMode("compare", () =>
    loadOwnerPlaceCards(dataSupabase(SAMPLE, { tables: [], eqs: [] }), "owner-1"),
  );
  assert.deepEqual(compared, sequential);
});

test("compare mode logs only a verdict, and flags every kind of difference by field name", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    await withMode("compare", () => loadOwnerPlaceCards(dataSupabase(SAMPLE, { tables: [], eqs: [] }), "owner-1"));
  } finally {
    console.log = original;
  }
  assert.deepEqual(lines, ["[perf] place-cards joined=equal"]);

  const card = (albumId: string, patch: Record<string, unknown> = {}) => ({
    albumId, experienceId: "e", experienceSlug: "s", experienceTitle: "T", title: albumId, countryCode: null,
    startsAt: null, endsAt: null, coverPhotoId: null, coverFocus: null, previewPhotoIds: [], photoCount: 1, ...patch,
  });
  const ok = (...cards: ReturnType<typeof card>[]) => ({ places: cards, error: null }) as never;
  assert.equal(describePlaceCardsComparison(ok(card("a"), card("b")), ok(card("a"), card("b"))), "equal");
  assert.equal(describePlaceCardsComparison(ok(card("a"), card("b")), ok(card("b"), card("a"))), "order-differs");
  assert.equal(describePlaceCardsComparison(ok(card("a")), ok(card("a", { photoCount: 2, coverFocus: { x: 1, y: 2, zoom: 1 } }))), "DIFFERENT fields=coverFocus,photoCount missing=0 extra=0");
  assert.equal(describePlaceCardsComparison(ok(card("a"), card("b")), ok(card("a"), card("c"))), "DIFFERENT fields=- missing=1 extra=1");
  assert.equal(describePlaceCardsComparison(ok(card("a")), null), "unavailable");
  assert.equal(describePlaceCardsComparison(ok(card("a")), ok(card("a", { title: "x", startsAt: "2024" }))), "DIFFERENT fields=startsAt,title missing=0 extra=0");
});

test("joined loader refuses a result whose albums lack the joined experience (falls back, never guesses)", async () => {
  const broken = { ...SAMPLE, albums: SAMPLE.albums.map((album) => Object.fromEntries(Object.entries(album).filter(([key]) => key !== "experiences"))) };
  const log = { tables: [] as string[], eqs: [] as unknown[][] };
  const result = await withMode("1", () => loadOwnerPlaceCards(dataSupabase(broken, log), "owner-1"));
  assert.ok(log.tables.includes("experiences"), "fell back to the sequential loader");
  assert.equal(result.error, null);
});

// ---- Porto Rico saved under "us" (regression: card showed the US flag and "USA") ----

const SAN_JUAN_ROW = { exact_latitude: 18.4655, exact_longitude: -66.1057 };
const MIAMI_ROW = { exact_latitude: 25.7617, exact_longitude: -80.1918 };

const US_FILED = {
  albums: [
    { id: "pr", experience_id: "ex1", name: "Local 1", cover_photo_id: null, position: 0, source_moment_id: "m1", moment: { place: { name: "Estados Unidos da América, San Juan", confirmed_by_user: false, country_code: "us", ...SAN_JUAN_ROW } }, experiences: { slug: "viagem", title: "Viagem" } },
    { id: "mia", experience_id: "ex1", name: "Local 1", cover_photo_id: null, position: 1, source_moment_id: "m2", moment: { place: { name: "Estados Unidos, Miami", confirmed_by_user: false, country_code: "us", ...MIAMI_ROW } }, experiences: { slug: "viagem", title: "Viagem" } },
    { id: "own", experience_id: "ex1", name: "Local 1", cover_photo_id: null, position: 2, source_moment_id: "m3", moment: { place: { name: "Estados Unidos, San Juan", confirmed_by_user: true, country_code: "us", ...SAN_JUAN_ROW } }, experiences: { slug: "viagem", title: "Viagem" } },
    { id: "fr", experience_id: "ex1", name: "Local 1", cover_photo_id: null, position: 3, source_moment_id: "m4", moment: { place: { name: "França, Paris", confirmed_by_user: false, country_code: "fr", ...SAN_JUAN_ROW } }, experiences: { slug: "viagem", title: "Viagem" } },
  ],
  photos: [],
  focus: [],
};

for (const mode of [undefined, "1"] as const) {
  test(`place cards (${mode ? "joined" : "sequential"}): a US-filed place inside Porto Rico is PR; Miami stays US; the person's own name and other countries are untouched`, async () => {
    const log = { tables: [] as string[], eqs: [] as unknown[][] };
    const result = await withMode(mode, () => loadOwnerPlaceCards(dataSupabase(US_FILED, log), "owner-1"));
    const byId = Object.fromEntries((result.places ?? []).map((card) => [card.albumId, card]));
    assert.equal(byId.pr?.countryCode, "PR");
    assert.equal(byId.pr?.title, "Porto Rico, San Juan");
    assert.equal(byId.mia?.countryCode, "US");
    assert.equal(byId.mia?.title, "Estados Unidos, Miami");
    assert.equal(byId.own?.countryCode, "US", "a name the person confirmed is theirs");
    assert.equal(byId.own?.title, "Estados Unidos, San Juan");
    assert.equal(byId.fr?.countryCode, "FR", "a place with another stored country is never reassigned");
    assert.ok(!JSON.stringify(result).includes("exact_"), "coordinates never leave the loader");
    assert.ok(!JSON.stringify(result).includes("18.4655"));
  });
}

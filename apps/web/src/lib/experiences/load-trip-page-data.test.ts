import assert from "node:assert/strict";
import test from "node:test";

import { loadTripPageData } from "./load-trip-page-data";

type Client = Parameters<typeof loadTripPageData>[0];

const EXPERIENCE_ROW = {
  id: "trip-1",
  owner_id: "owner-1",
  slug: "demo",
  title: "Demo",
  description: null,
  starts_at: null,
  ends_at: null,
  primary_city: null,
  primary_country: null,
  cover_photo_id: null,
  status: "published",
  visibility: "public",
};

/**
 * Fake query builder. `albums` and `photos` stay pending until the `users`
 * (owner slug) query has been ISSUED — so if the loader ever goes back to
 * asking for the slug only after they finish, this deadlocks and the test
 * fails on its timeout.
 */
function fakeClient(issued: string[]): Client {
  let releaseSlowQueries!: () => void;
  const usersIssued = new Promise<void>((resolve) => {
    releaseSlowQueries = resolve;
  });

  function builder(table: string) {
    issued.push(table);
    if (table === "users") releaseSlowQueries();
    const result = async () => {
      if (table === "albums" || table === "photos") await usersIssued;
      if (table === "experiences") return { data: EXPERIENCE_ROW, error: null };
      if (table === "users") return { data: { profile_slug: "ana" }, error: null };
      return { data: [], error: null };
    };
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      in: () => self,
      order: () => self,
      maybeSingle: () => result(),
      then: (resolve: (value: unknown) => unknown, reject: (e: unknown) => unknown) =>
        result().then(resolve, reject),
    };
    return self;
  }
  return { from: builder } as unknown as Client;
}

test("loadTripPageData asks for the owner slug concurrently with albums/photos", async () => {
  const issued: string[] = [];
  const data = await loadTripPageData(fakeClient(issued), "demo");
  assert.ok(data);
  assert.equal(data.ownerProfileSlug, "ana");
  assert.deepEqual(issued.slice(0, 1), ["experiences"]);
  assert.deepEqual([...issued.slice(1)].sort(), ["albums", "photos", "users"]);
});

test("loadTripPageData returns null for an unknown trip without extra queries", async () => {
  const issued: string[] = [];
  const client = {
    from: (table: string) => {
      issued.push(table);
      const self: Record<string, unknown> = {
        select: () => self,
        eq: () => self,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return self;
    },
  } as unknown as Client;
  assert.equal(await loadTripPageData(client, "nope"), null);
  assert.deepEqual(issued, ["experiences"]);
});

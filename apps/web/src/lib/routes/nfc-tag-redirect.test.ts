import assert from "node:assert/strict";
import test from "node:test";

import { profileTripAlbumPath } from "./app-routes";

import {
  type NfcTagLookupClient,
  nfcTagRedirectResponse,
  notLinkedPath,
  resolveNfcTagPath,
} from "./nfc-tag-redirect";

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const ALBUM_ID = "22222222-2222-4222-8222-222222222222";

function fakeClient(opts: {
  rpcData?: unknown;
  rpcError?: unknown;
  slug?: string | null;
  slugError?: unknown;
}) {
  const calls: { rpc: unknown[]; experienceId: unknown[] } = { rpc: [], experienceId: [] };
  const client: NfcTagLookupClient = {
    async rpc(fn, args) {
      calls.rpc.push([fn, args]);
      return { data: opts.rpcData ?? null, error: opts.rpcError ?? null };
    },
    from() {
      return {
        select: () => ({
          eq: (_column, value) => {
            calls.experienceId.push(value);
            return {
              async maybeSingle() {
                return {
                  data: opts.slug ? { slug: opts.slug } : null,
                  error: opts.slugError ?? null,
                };
              },
            };
          },
        }),
      };
    },
  };
  return { client, calls };
}

test("linked tag: HTTP 307 straight to the exact album the tag was linked to", async () => {
  const { client, calls } = fakeClient({
    rpcData: [{ trip_id: TRIP_ID, album_id: ALBUM_ID }],
    slug: "dubai-2026",
  });
  const res = await nfcTagRedirectResponse(client, "abc123");

  assert.equal(res.status, 307);
  assert.equal(
    res.headers.get("location"),
    `/perfil/dubai-2026/album/${ALBUM_ID}`,
  );
  assert.equal(res.headers.get("location"), profileTripAlbumPath("dubai-2026", ALBUM_ID));
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.body, null, "no document is streamed — the browser follows straight to the album");
  assert.deepEqual(calls.rpc, [["resolve_nfc_token", { p_token: "abc123" }]]);
  assert.deepEqual(calls.experienceId, [TRIP_ID], "slug is looked up by the resolved trip_id");
});

test("uses the album_id from the tag, not a re-derived first album", async () => {
  const other = "33333333-3333-4333-8333-333333333333";
  const { client } = fakeClient({
    rpcData: [{ trip_id: TRIP_ID, album_id: other }],
    slug: "trip",
  });
  const res = await nfcTagRedirectResponse(client, "t");
  assert.equal(res.headers.get("location"), `/perfil/trip/album/${other}`);
});

test("token is URL-decoded and trimmed before resolving, as before", async () => {
  const { client, calls } = fakeClient({
    rpcData: [{ trip_id: TRIP_ID, album_id: ALBUM_ID }],
    slug: "trip",
  });
  await nfcTagRedirectResponse(client, "%20ab%2Fc%20");
  assert.deepEqual(calls.rpc, [["resolve_nfc_token", { p_token: "ab/c" }]]);
});

async function assertNotLinked(res: Response, token: string) {
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), `/n/${token}/nao-vinculada`);
  assert.equal(res.headers.get("cache-control"), "no-store");
}

test("unknown tag (empty rpc result) → not-linked page", async () => {
  const { client } = fakeClient({ rpcData: [] });
  await assertNotLinked(await nfcTagRedirectResponse(client, "nope"), "nope");
});

test("rpc error → not-linked page", async () => {
  const { client } = fakeClient({ rpcError: new Error("boom") });
  await assertNotLinked(await nfcTagRedirectResponse(client, "x"), "x");
});

test("row missing trip or album → not-linked page", async () => {
  for (const row of [{ trip_id: TRIP_ID, album_id: "" }, { trip_id: "", album_id: ALBUM_ID }]) {
    const { client } = fakeClient({ rpcData: [row], slug: "trip" });
    await assertNotLinked(await nfcTagRedirectResponse(client, "x"), "x");
  }
});

test("trip not visible (no slug / slug error) → not-linked page", async () => {
  const hidden = fakeClient({ rpcData: [{ trip_id: TRIP_ID, album_id: ALBUM_ID }], slug: null });
  await assertNotLinked(await nfcTagRedirectResponse(hidden.client, "x"), "x");
  const failing = fakeClient({
    rpcData: [{ trip_id: TRIP_ID, album_id: ALBUM_ID }],
    slug: "trip",
    slugError: new Error("rls"),
  });
  await assertNotLinked(await nfcTagRedirectResponse(failing.client, "x"), "x");
});

test("empty token and missing Supabase config → not-linked page, no lookup", async () => {
  const { client, calls } = fakeClient({});
  await assertNotLinked(await nfcTagRedirectResponse(client, "%20"), "%20");
  assert.equal(calls.rpc.length, 0);
  await assertNotLinked(await nfcTagRedirectResponse(null, "abc"), "abc");
});

test("resolveNfcTagPath gives the album path of the linked trip", async () => {
  const { client } = fakeClient({
    rpcData: [{ trip_id: TRIP_ID, album_id: ALBUM_ID }],
    slug: "dubai-2026",
  });
  assert.equal(
    await resolveNfcTagPath(client, "abc"),
    profileTripAlbumPath("dubai-2026", ALBUM_ID),
  );
});

test("resolveNfcTagPath falls back to the not-linked page for anything unresolvable", async () => {
  assert.equal(await resolveNfcTagPath(null, "abc"), notLinkedPath("abc"));
  assert.equal(await resolveNfcTagPath(fakeClient({ rpcData: [] }).client, "abc"), notLinkedPath("abc"));
  assert.equal(await resolveNfcTagPath(fakeClient({ rpcError: new Error("boom") }).client, "abc"), notLinkedPath("abc"));
  assert.equal(
    await resolveNfcTagPath(fakeClient({ rpcData: [{ trip_id: TRIP_ID, album_id: ALBUM_ID }], slug: null }).client, "abc"),
    notLinkedPath("abc"),
  );
  assert.equal(await resolveNfcTagPath(fakeClient({}).client, "   "), notLinkedPath("   "));
});

test("the token reaches the lookup decoded, and the not-linked page keeps it encoded", async () => {
  const { client } = fakeClient({ rpcData: [] });
  const raw = encodeURIComponent("a b/ç");
  assert.equal(await resolveNfcTagPath(client, raw), `/n/${raw}/nao-vinculada`);
});

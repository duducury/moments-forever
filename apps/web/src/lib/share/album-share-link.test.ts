import assert from "node:assert/strict";
import test from "node:test";

import { fetchAlbumShareLink } from "./album-share-link";

const reply = (status: number, body: unknown = {}) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("the album's short link is used as is", async () => {
  const seen: string[] = [];
  const result = await fetchAlbumShareLink("album-1", async (input) => {
    seen.push(input);
    return reply(200, { shortCode: "ab12", url: "https://momentsforever.vercel.app/a/ab12" })();
  });
  assert.deepEqual(result, { status: "ok", url: "https://momentsforever.vercel.app/a/ab12" });
  assert.deepEqual(seen, ["/api/albums/album-1/short-link"]);
});

test("an album without a short link, or one the viewer cannot read, is 'unavailable' — never a made-up URL", async () => {
  assert.deepEqual(await fetchAlbumShareLink("a", reply(404, { error: "Álbum não encontrado." })), { status: "unavailable" });
  assert.deepEqual(await fetchAlbumShareLink("a", reply(403)), { status: "unavailable" });
  assert.deepEqual(await fetchAlbumShareLink(null), { status: "unavailable" });
  assert.deepEqual(await fetchAlbumShareLink("a", reply(200, { url: "javascript:alert(1)" })), { status: "unavailable" });
  assert.deepEqual(await fetchAlbumShareLink("a", reply(200, {})), { status: "unavailable" });
});

test("a failing lookup is an error, not a link", async () => {
  assert.deepEqual(await fetchAlbumShareLink("a", reply(500)), { status: "error" });
  assert.deepEqual(
    await fetchAlbumShareLink("a", async () => {
      throw new Error("offline");
    }),
    { status: "error" },
  );
});

test("the shared URL points at a route that exists: /a/{code} → the album page", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const page = new URL("../../app/a/[code]/page.tsx", import.meta.url);
  const api = new URL("../../app/api/albums/[id]/short-link/route.ts", import.meta.url);
  assert.ok(existsSync(page), "short album page");
  assert.ok(existsSync(api), "short-link API");
  // The API builds `${site}/a/${shortCode}`, and that page redirects to the real album path.
  assert.match(readFileSync(api, "utf8"), /\/a\/\$\{shortCode\}/u);
  assert.match(readFileSync(page, "utf8"), /profileTripAlbumPath/u);
});

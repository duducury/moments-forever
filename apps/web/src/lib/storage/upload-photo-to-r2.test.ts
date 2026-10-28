import assert from "node:assert/strict";
import test from "node:test";

import { storageUnreachableMessage } from "./upload-photo-to-r2";

test("the failure message names the app origin the R2 CORS rule has to allow", () => {
  const message = storageUnreachableMessage("https://moments-forever-abc-x.vercel.app");
  assert.match(message, /CORS do R2/);
  assert.match(message, /https:\/\/moments-forever-abc-x\.vercel\.app/);
  assert.match(message, /PUT/);
});

test("without a window (server) the message still reads well", () => {
  const message = storageUnreachableMessage(null);
  assert.doesNotMatch(message, /Origem deste app/);
  assert.match(message, /CORS do R2/);
});

// ---- batched upload engine ----

import { uploadManyPhotoBlobsToR2, uploadPhotoBatchToR2 } from "./upload-photo-to-r2";

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

async function withFetch<T>(handler: Handler, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

function photo(id: string, withThumb = true) {
  return { id, full: new Blob(["x".repeat(100)], { type: "image/jpeg" }), thumbnail: withThumb ? new Blob(["t"], { type: "image/jpeg" }) : null };
}

function server(options: { failPut?: (url: string, attempt: number) => boolean; confirmError?: (photoId: string) => string | null } = {}) {
  const calls = { urls: 0, confirm: 0, puts: [] as string[], other: [] as string[] };
  const attempts = new Map<string, number>();
  const handler: Handler = async (url, init) => {
    if (url === "/api/media/upload-urls") {
      calls.urls += 1;
      const body = JSON.parse(String(init?.body)) as { items: { photoId: string; variant: string }[] };
      return json({
        items: body.items.map((item) => ({
          photoId: item.photoId,
          variant: item.variant,
          uploadUrl: `https://r2.test/${item.photoId}/${item.variant}`,
          key: `photos/u/e/${item.photoId}/${item.variant}`,
        })),
      });
    }
    if (url.startsWith("https://r2.test/")) {
      const attempt = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, attempt);
      calls.puts.push(url);
      if (options.failPut?.(url, attempt)) throw new TypeError("network");
      return new Response("", { status: 200 });
    }
    if (url === "/api/media/confirm-batch") {
      calls.confirm += 1;
      const body = JSON.parse(String(init?.body)) as { items: { photoId: string }[] };
      return json({
        results: body.items.map((item) => {
          const error = options.confirmError?.(item.photoId) ?? null;
          return error ? { photoId: item.photoId, ok: false, error } : { photoId: item.photoId, ok: true };
        }),
      });
    }
    calls.other.push(url);
    return json({ error: "unexpected" }, 500);
  };
  return { handler, calls };
}

test("a batch costs ONE url request and ONE confirmation, however many photos", async () => {
  const s = server();
  const progress: number[] = [];
  const outcome = await withFetch(s.handler, () =>
    uploadPhotoBatchToR2("exp", [photo("a"), photo("b"), photo("c", false), photo("d")], (done) => progress.push(done)),
  );
  assert.deepEqual([...outcome.uploaded].sort(), ["a", "b", "c", "d"]);
  assert.deepEqual(outcome.failed, []);
  assert.equal(s.calls.urls, 1);
  assert.equal(s.calls.confirm, 1);
  assert.equal(s.calls.puts.length, 7, "3 photos with a thumbnail + 1 without");
  assert.deepEqual(progress, [1, 2, 3, 4]);
  assert.deepEqual(s.calls.other, []);
});

test("a dropped connection is retried once, so a blip does not fail the photo", async () => {
  const s = server({ failPut: (url, attempt) => url.endsWith("/b/original") && attempt === 1 });
  const outcome = await withFetch(s.handler, () => uploadPhotoBatchToR2("exp", [photo("a"), photo("b")]));
  assert.deepEqual(outcome.failed, []);
  assert.equal(outcome.uploaded.length, 2);
});

test("a photo that keeps failing does not stop the others, and is not confirmed", async () => {
  const s = server({ failPut: (url) => url.includes("/b/") });
  let confirmedIds: string[] = [];
  const base = s.handler;
  const outcome = await withFetch(
    async (url, init) => {
      if (url === "/api/media/confirm-batch") confirmedIds = (JSON.parse(String(init?.body)) as { items: { photoId: string }[] }).items.map((item) => item.photoId);
      return base(url, init);
    },
    () => uploadPhotoBatchToR2("exp", [photo("a"), photo("b"), photo("c")]),
  );
  assert.deepEqual([...outcome.uploaded].sort(), ["a", "c"]);
  assert.equal(outcome.failed.length, 1);
  assert.equal(outcome.failed[0]?.id, "b");
  assert.match(outcome.failed[0]?.error ?? "", /armazenamento/);
  assert.deepEqual(confirmedIds.sort(), ["a", "c"], "a photo whose file is not in the cloud is never confirmed");
});

test("a photo the server cannot confirm is reported as failed, the rest are uploaded", async () => {
  const s = server({ confirmError: (id) => (id === "c" ? "Objeto não encontrado no armazenamento." : null) });
  const outcome = await withFetch(s.handler, () => uploadPhotoBatchToR2("exp", [photo("a"), photo("c")]));
  assert.deepEqual(outcome.uploaded, ["a"]);
  assert.deepEqual(outcome.failed, [{ id: "c", error: "Objeto não encontrado no armazenamento." }]);
});

test("more than one request's worth of photos is split into chunks", async () => {
  const s = server();
  const items = Array.from({ length: 85 }, (_, i) => photo(`p${i}`, false));
  const outcome = await withFetch(s.handler, () => uploadPhotoBatchToR2("exp", items));
  assert.equal(outcome.uploaded.length, 85);
  assert.equal(s.calls.urls, 3);
  assert.equal(s.calls.confirm, 3);
});

test("without the batch routes (older deployment) it falls back to the per-photo routes", async () => {
  const seen: string[] = [];
  const outcome = await withFetch(
    async (url) => {
      seen.push(url);
      if (url === "/api/media/upload-urls") return new Response("not found", { status: 404 });
      if (url === "/api/media/upload-url") return json({ uploadUrl: "https://r2.test/x", key: "k" });
      if (url.startsWith("https://r2.test/")) return new Response("", { status: 200 });
      if (url === "/api/media/confirm") return json({ photo: {} });
      return json({ error: "unexpected" }, 500);
    },
    () => uploadPhotoBatchToR2("exp", [photo("a"), photo("b")]),
  );
  assert.deepEqual([...outcome.uploaded].sort(), ["a", "b"]);
  assert.ok(seen.includes("/api/media/upload-url"));
  assert.ok(seen.includes("/api/media/confirm"));
});

test("the wrapper still throws when any photo is missing, after trying all of them", async () => {
  const s = server({ failPut: (url) => url.includes("/b/") });
  await withFetch(s.handler, async () => {
    await assert.rejects(() => uploadManyPhotoBlobsToR2("exp", [photo("a"), photo("b")]), /1 de 2 fotos/);
  });
  assert.ok(s.calls.puts.some((url) => url.includes("/a/")), "the healthy photo was still sent");
});

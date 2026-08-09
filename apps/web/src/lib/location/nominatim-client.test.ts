import assert from "node:assert/strict";
import test from "node:test";

import {
  createNominatimClient,
  NOMINATIM_USER_AGENT,
} from "./nominatim-client";

test("reverseGeocode returns travel label for valid GPS", async () => {
  const client = createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          name: "Nusa Penida",
          addresstype: "island",
          address: {
            island: "Nusa Penida",
            state: "Bali",
            country: "Indonesia",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  const result = await client.reverseGeocode(-8.7275, 115.5444);
  assert.equal(result.status, "ok");
  assert.equal(result.label, "Nusa Penida");
});

test("HTTP 429 is treated without throwing", async () => {
  let calls = 0;
  const client = createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "0" },
      });
    },
  });

  const result = await client.reverseGeocode(-8.7, 115.5);
  assert.equal(result.status, "rate_limited");
  assert.equal(result.label, null);
  assert.equal(calls, 1);
});

test("timeout/error returns empty label", async () => {
  const client = createNominatimClient({
    minIntervalMs: 0,
    timeoutMs: 5,
    sleep: async () => undefined,
    fetchImpl: async (_url, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
      return new Response("{}");
    },
  });

  const result = await client.reverseGeocode(-8.7, 115.5);
  assert.equal(result.status, "timeout");
  assert.equal(result.label, null);
});

test("User-Agent identifies Moments Forever", async () => {
  let seenAgent = "";
  const client = createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async (_url, init) => {
      const headers = new Headers(init?.headers);
      seenAgent = headers.get("User-Agent") ?? "";
      return new Response(JSON.stringify({ address: { city: "Dubai" } }), {
        status: 200,
      });
    },
  });

  await client.reverseGeocode(25.2, 55.27);
  assert.match(seenAgent, /MomentsForever/u);
  assert.equal(seenAgent, NOMINATIM_USER_AGENT);
});

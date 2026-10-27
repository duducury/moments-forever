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
  assert.equal(result.label, "Indonésia, Nusa Penida");
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

function clientAnswering(address: Record<string, string>, extra: Record<string, string> = {}) {
  return createNominatimClient({
    minIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async () =>
      new Response(JSON.stringify({ addresstype: "city", ...extra, address }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
}

test("Puerto Rico, filed by Nominatim under the United States, is answered as PR (ISO subdivision)", async () => {
  const places: [string, number, number, string][] = [
    ["San Juan", 18.4655, -66.1057, "San Juan"],
    ["Vieques", 18.1263, -65.4401, "Vieques"],
    ["Culebra", 18.3, -65.3, "Culebra"],
  ];
  for (const [name, lat, lon, locality] of places) {
    const result = await clientAnswering(
      {
        city: name,
        state: "Porto Rico",
        "ISO3166-2-lvl4": "US-PR",
        country: "Estados Unidos da América",
        country_code: "us",
      },
      { name },
    ).reverseGeocode(lat, lon);
    assert.equal(result.countryCode, "PR", name);
    assert.equal(result.label, `Porto Rico, ${locality}`, name);
  }
});

test("Puerto Rico is recognised by its coordinates when the answer carries no ISO subdivision", async () => {
  const result = await clientAnswering({
    city: "San Juan",
    state: "Porto Rico",
    country: "Estados Unidos da América",
    country_code: "us",
  }).reverseGeocode(18.4655, -66.1057);
  assert.equal(result.countryCode, "PR");
  assert.equal(result.label, "Porto Rico, San Juan");
});

test("a real US place stays US, with the country name normalised", async () => {
  const miami = await clientAnswering({
    city: "Miami",
    state: "Flórida",
    "ISO3166-2-lvl4": "US-FL",
    country: "Estados Unidos da América",
    country_code: "us",
  }).reverseGeocode(25.7617, -80.1918);
  assert.equal(miami.countryCode, "US");
  assert.equal(miami.label, "Estados Unidos, Miami");

  // Same country, outside every territory box (Key West is the closest US land to Cuba/Caribbean).
  const keyWest = await clientAnswering({ city: "Key West", state: "Flórida", country: "Estados Unidos", country_code: "us" }).reverseGeocode(24.5551, -81.78);
  assert.equal(keyWest.countryCode, "US");
  assert.equal(keyWest.label, "Estados Unidos, Key West");
});

test("a place the geocoder files under another country is never turned into a US territory", async () => {
  const tortola = await clientAnswering({ island: "Tortola", country: "Ilhas Virgens Britânicas", country_code: "vg" }).reverseGeocode(18.43, -64.62);
  assert.equal(tortola.countryCode, "VG");
});

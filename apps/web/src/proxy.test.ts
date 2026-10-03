import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

import { NextRequest } from "next/server";

import { proxy } from "./proxy";

const COOKIE = "sb-abcdefgh-auth-token";

function session(accessToken: string, expiresInSec: number) {
  return {
    access_token: accessToken,
    refresh_token: "refresh-1",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSec,
    user: {
      id: "44444444-4444-4444-8444-444444444444",
      aud: "authenticated",
      email: "ana@test.invalid",
      app_metadata: {},
      user_metadata: {},
      created_at: "2024-01-01T00:00:00Z",
    },
  };
}

function requestWith(cookie: string | null) {
  return new NextRequest("https://example.test/ana", {
    headers: cookie ? { cookie } : {},
  });
}

function cookieFor(accessToken: string, expiresInSec: number): string {
  const value =
    "base64-" +
    Buffer.from(JSON.stringify(session(accessToken, expiresInSec))).toString(
      "base64url",
    );
  return `${COOKIE}=${value}`;
}

/** Replaces global fetch for one test; records every call. */
function stubFetch(handler: (url: string) => Response) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const refreshedBody = () =>
  new Response(JSON.stringify(session("new.access.token", 3600)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

test("visitors (no session cookie) are passed through untouched, with no network call", async () => {
  const stub = stubFetch(() => assert.fail("must not call Supabase"));
  try {
    const response = await proxy(requestWith(null));
    assert.equal(response.headers.getSetCookie().length, 0);
    assert.deepEqual(stub.calls, []);

    const unrelated = await proxy(requestWith("theme=dark; other=1"));
    assert.equal(unrelated.headers.getSetCookie().length, 0);
    assert.deepEqual(stub.calls, []);
  } finally {
    stub.restore();
  }
});

test("a still-valid session costs no network call and sets no cookie", async () => {
  const stub = stubFetch(() => assert.fail("must not call Supabase"));
  try {
    const response = await proxy(requestWith(cookieFor("valid.access.token", 3000)));
    assert.equal(response.headers.getSetCookie().length, 0);
    assert.deepEqual(stub.calls, []);
  } finally {
    stub.restore();
  }
});

test("an expired session is refreshed once and the new tokens are written back via Set-Cookie", async () => {
  const stub = stubFetch((url) => {
    assert.ok(url.includes("/auth/v1/token"), `unexpected call ${url}`);
    assert.ok(url.includes("grant_type=refresh_token"));
    return refreshedBody();
  });
  try {
    const response = await proxy(requestWith(cookieFor("old.access.token", -600)));
    assert.equal(stub.calls.length, 1);
    const set = response.headers.getSetCookie().filter((c) => c.startsWith(COOKIE));
    assert.ok(set.length >= 1, "refreshed session must be persisted");
    const stored = decodeURIComponent(set[0]!.split(";")[0]!.split("=").slice(1).join("="));
    const json = JSON.parse(
      Buffer.from(stored.replace(/^base64-/, ""), "base64url").toString(),
    ) as { access_token: string; refresh_token: string };
    assert.equal(json.access_token, "new.access.token");
    assert.match(set[0]!, /max-age=\d{6,}/i, "long-lived, not a session cookie");
  } finally {
    stub.restore();
  }
});

test("a session about to expire (inside the refresh margin) is renewed too", async () => {
  const stub = stubFetch(() => refreshedBody());
  try {
    const response = await proxy(requestWith(cookieFor("old.access.token", 30)));
    assert.equal(stub.calls.length, 1);
    assert.ok(response.headers.getSetCookie().some((c) => c.startsWith(COOKIE)));
  } finally {
    stub.restore();
  }
});

test("a failing refresh never throws or blocks the request", async () => {
  const stub = stubFetch(
    () => new Response(JSON.stringify({ msg: "nope" }), { status: 400, headers: { "content-type": "application/json" } }),
  );
  try {
    const response = await proxy(requestWith(cookieFor("old.access.token", -600)));
    assert.ok(response, "request is let through");
  } finally {
    stub.restore();
  }
});

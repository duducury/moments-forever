import assert from "node:assert/strict";
import test from "node:test";

import { peekSessionUserId } from "../supabase/session-user-id";

function jwt(payload: object): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.signature`;
}

const clientWith = (session: { access_token?: string } | null) =>
  ({ auth: { getSession: async () => ({ data: { session } }) } }) as unknown as Parameters<typeof peekSessionUserId>[0];

test("reads the user id from the session's access token, locally", async () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(await peekSessionUserId(clientWith({ access_token: jwt({ sub: "user-1", exp: future }) })), "user-1");
});

test("an expired token gives null: no early reads for it", async () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  assert.equal(await peekSessionUserId(clientWith({ access_token: jwt({ sub: "user-1", exp: past }) })), null);
});

test("no session, a malformed token or a token without sub give null (never throw)", async () => {
  assert.equal(await peekSessionUserId(clientWith(null)), null);
  assert.equal(await peekSessionUserId(clientWith({ access_token: "not-a-jwt" })), null);
  assert.equal(await peekSessionUserId(clientWith({ access_token: jwt({ exp: 1 }) })), null);
  assert.equal(await peekSessionUserId(clientWith({ access_token: jwt({ sub: 42 }) })), null);
  const broken = { auth: { getSession: async () => { throw new Error("boom"); } } } as unknown as Parameters<typeof peekSessionUserId>[0];
  assert.equal(await peekSessionUserId(broken), null);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  loginErrorMessage,
  resolveAuthCallback,
  type AuthCallbackClient,
} from "./auth-callback";

const ORIGIN = "https://app.example";
const CODE = "11111111-2222-3333-4444-555555555555";

function fakeClient(options: {
  readonly exchangeError?: { code?: string } | null;
  readonly user?: { id: string } | null;
  readonly calls?: string[];
}): () => Promise<AuthCallbackClient> {
  return async () => ({
    auth: {
      exchangeCodeForSession: async (code) => {
        options.calls?.push(code);
        return { error: options.exchangeError ?? null };
      },
      getUser: async () => ({ data: { user: options.user ?? null } }),
    },
  });
}

test("a valid code is exchanged exactly once and lands on /perfil", async () => {
  const calls: string[] = [];
  const target = await resolveAuthCallback(`${ORIGIN}/auth/callback?code=${CODE}`, {
    createClient: fakeClient({ calls }),
    hasVerifierCookie: true,
  });
  assert.equal(target.href, `${ORIGIN}/perfil`);
  assert.deepEqual(calls, [CODE]);
});

test("`next` is honoured only from the allowlist", async () => {
  const ok = await resolveAuthCallback(`${ORIGIN}/auth/callback?code=${CODE}&next=/ativar`, {
    createClient: fakeClient({}),
    hasVerifierCookie: true,
  });
  assert.equal(ok.href, `${ORIGIN}/ativar`);
  for (const evil of ["//evil.example", "https://evil.example", "/admin"]) {
    const target = await resolveAuthCallback(
      `${ORIGIN}/auth/callback?code=${CODE}&next=${encodeURIComponent(evil)}`,
      { createClient: fakeClient({}), hasVerifierCookie: true },
    );
    assert.equal(target.href, `${ORIGIN}/perfil`, evil);
  }
});

test("without a code nothing is exchanged and the login shows an error", async () => {
  const calls: string[] = [];
  const target = await resolveAuthCallback(`${ORIGIN}/auth/callback`, {
    createClient: fakeClient({ calls }),
    hasVerifierCookie: true,
  });
  assert.equal(target.href, `${ORIGIN}/login?error=missing_code`);
  assert.deepEqual(calls, []);
});

test("an unconfigured server reports it instead of looping", async () => {
  const target = await resolveAuthCallback(`${ORIGIN}/auth/callback?code=${CODE}`, {
    createClient: async () => null,
    hasVerifierCookie: true,
  });
  assert.equal(target.href, `${ORIGIN}/login?error=supabase_not_configured`);
});

test("a failed exchange without the PKCE verifier says so and never logs the code", async () => {
  const logs: string[] = [];
  const target = await resolveAuthCallback(`${ORIGIN}/auth/callback?code=${CODE}`, {
    createClient: fakeClient({ exchangeError: { code: "flow_state_not_found" } }),
    hasVerifierCookie: false,
    warn: (message) => logs.push(message),
  });
  assert.equal(target.href, `${ORIGIN}/login?error=auth_callback_failed&reason=no_verifier`);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /no_verifier/);
  assert.ok(!logs[0].includes(CODE));
});

test("a failed exchange with a verifier is reported as exchange_failed", async () => {
  const target = await resolveAuthCallback(`${ORIGIN}/auth/callback?code=${CODE}`, {
    createClient: fakeClient({ exchangeError: { code: "bad_code" } }),
    hasVerifierCookie: true,
  });
  assert.equal(target.searchParams.get("reason"), "exchange_failed");
});

test("the same code arriving twice is a success when the first exchange already signed the person in", async () => {
  const target = await resolveAuthCallback(`${ORIGIN}/auth/callback?code=${CODE}`, {
    createClient: fakeClient({ exchangeError: { code: "flow_state_not_found" }, user: { id: "u1" } }),
    hasVerifierCookie: false,
  });
  assert.equal(target.href, `${ORIGIN}/perfil`);
});

test("login error messages: friendly text for known failures, nothing otherwise", () => {
  assert.match(loginErrorMessage("?error=auth_callback_failed&reason=no_verifier") ?? "", /perdida/);
  assert.match(loginErrorMessage("?error=auth_callback_failed") ?? "", /Tente entrar novamente/);
  assert.ok(loginErrorMessage("?error=missing_code"));
  assert.equal(loginErrorMessage(""), null);
  assert.equal(loginErrorMessage("?error=<script>"), null);
});

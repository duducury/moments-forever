import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  APPLE_NATIVE_CLIENT_ID,
  appleErrorMessage,
  composeAppleFullName,
  createNoncePair,
  isAppleCancellation,
  isNativeIosApp,
  randomNonce,
  sha256Hex,
  signInWithAppleNative,
  type AppleAuthorizeOptions,
  type AppleAuthorizeResult,
  type AppleSupabaseClient,
} from "./apple-sign-in";

test("sha256Hex matches the standard test vector", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("randomNonce is 64 hex chars and different every time", () => {
  const a = randomNonce();
  const b = randomNonce();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("createNoncePair hashes the raw nonce (hash for Apple, raw for Supabase)", async () => {
  const pair = await createNoncePair("raw-nonce");
  assert.equal(pair.raw, "raw-nonce");
  assert.equal(pair.hashed, await sha256Hex("raw-nonce"));
  assert.notEqual(pair.hashed, pair.raw);
});

test("the native client id is the Capacitor appId / bundle id", () => {
  const config = readFileSync(path.resolve(__dirname, "../../../capacitor.config.ts"), "utf8");
  assert.equal(config.match(/appId:\s*"([^"]+)"/)?.[1], APPLE_NATIVE_CLIENT_ID);
});

test("isNativeIosApp is true only for the native iOS shell", () => {
  assert.equal(isNativeIosApp(undefined), false);
  assert.equal(isNativeIosApp({ isNativePlatform: () => false, getPlatform: () => "web" }), false);
  assert.equal(isNativeIosApp({ isNativePlatform: () => true, getPlatform: () => "android" }), false);
  assert.equal(isNativeIosApp({ isNativePlatform: () => true, getPlatform: () => "ios" }), true);
  assert.equal(
    isNativeIosApp({
      isNativePlatform: () => {
        throw new Error("boom");
      },
    }),
    false,
  );
});

test("composeAppleFullName joins what Apple sent and ignores blanks", () => {
  assert.equal(composeAppleFullName("Maria", "Silva"), "Maria Silva");
  assert.equal(composeAppleFullName(" Maria ", null), "Maria");
  assert.equal(composeAppleFullName(null, "Silva"), "Silva");
  assert.equal(composeAppleFullName("", "  "), null);
  assert.equal(composeAppleFullName(undefined, undefined), null);
});

test("cancelling the sheet is not an error; other failures get friendly messages", () => {
  assert.equal(
    isAppleCancellation(
      new Error("The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)"),
    ),
    true,
  );
  assert.equal(isAppleCancellation(new Error("canceled")), true);
  assert.equal(isAppleCancellation(new Error("network down")), false);
  assert.match(appleErrorMessage(new Error("AuthorizationError error 1000.")), /iCloud/);
  assert.match(appleErrorMessage({ message: "Unsupported provider: provider is not enabled" }), /ainda não está disponível/);
  assert.match(appleErrorMessage(new Error("whatever")), /Tente novamente/);
});

function fakeSupabase(options: {
  signInError?: { message: string } | null;
  user?: { id: string; user_metadata?: Record<string, unknown> } | null;
  updateUserThrows?: boolean;
}) {
  const calls = {
    signIn: [] as { provider: string; token: string; nonce?: string }[],
    updateUser: [] as Record<string, unknown>[],
    displayName: [] as { name: string; id: string }[],
  };
  const client: AppleSupabaseClient = {
    auth: {
      async signInWithIdToken(credentials) {
        calls.signIn.push(credentials);
        return {
          data: { user: options.signInError ? null : (options.user ?? { id: "u1", user_metadata: {} }) },
          error: options.signInError ?? null,
        };
      },
      async updateUser(attributes) {
        if (options.updateUserThrows) throw new Error("offline");
        calls.updateUser.push(attributes.data);
        return { error: null };
      },
    },
    from() {
      return {
        update(values) {
          return {
            async eq(_column, id) {
              calls.displayName.push({ name: values.display_name, id });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const authorization = (overrides: Partial<AppleAuthorizeResult["response"]> = {}): AppleAuthorizeResult => ({
  response: {
    user: "apple-user",
    email: "x@privaterelay.appleid.com",
    givenName: null,
    familyName: null,
    identityToken: "jwt-from-apple",
    authorizationCode: "code",
    ...overrides,
  },
});

test("happy path: Apple gets the HASHED nonce, Supabase gets the RAW nonce + token", async () => {
  const { client, calls } = fakeSupabase({});
  let authorizeOptions: AppleAuthorizeOptions | undefined;
  const result = await signInWithAppleNative(client, {
    createNonce: () => createNoncePair("raw-123"),
    authorize: async (options) => {
      authorizeOptions = options;
      return authorization();
    },
  });
  assert.deepEqual(result, { status: "signed-in" });
  assert.equal(authorizeOptions?.clientId, APPLE_NATIVE_CLIENT_ID);
  assert.equal(authorizeOptions?.scopes, "email name");
  assert.equal(authorizeOptions?.nonce, await sha256Hex("raw-123"));
  assert.deepEqual(calls.signIn, [{ provider: "apple", token: "jwt-from-apple", nonce: "raw-123" }]);
  assert.equal(calls.updateUser.length, 0, "no name from Apple -> profile untouched");
});

test("first sign-in: the name Apple returns is saved to the auth metadata and the profile", async () => {
  const { client, calls } = fakeSupabase({});
  await signInWithAppleNative(client, {
    authorize: async () => authorization({ givenName: "Maria", familyName: "Silva" }),
  });
  assert.deepEqual(calls.updateUser, [
    { full_name: "Maria Silva", given_name: "Maria", family_name: "Silva" },
  ]);
  assert.deepEqual(calls.displayName, [{ name: "Maria Silva", id: "u1" }]);
});

test("an existing profile name is never overwritten", async () => {
  const { client, calls } = fakeSupabase({
    user: { id: "u1", user_metadata: { full_name: "Nome Antigo" } },
  });
  await signInWithAppleNative(client, {
    authorize: async () => authorization({ givenName: "Maria", familyName: "Silva" }),
  });
  assert.equal(calls.updateUser.length, 0);
  assert.equal(calls.displayName.length, 0);
});

test("failing to save the name does not fail the sign-in", async () => {
  const { client } = fakeSupabase({ updateUserThrows: true });
  const result = await signInWithAppleNative(client, {
    authorize: async () => authorization({ givenName: "Maria" }),
  });
  assert.deepEqual(result, { status: "signed-in" });
});

test("closing the sheet resolves as cancelled and never calls Supabase", async () => {
  const { client, calls } = fakeSupabase({});
  const result = await signInWithAppleNative(client, {
    authorize: async () => {
      throw new Error("AuthorizationError error 1001.");
    },
  });
  assert.deepEqual(result, { status: "cancelled" });
  assert.equal(calls.signIn.length, 0);
});

test("plugin failure and a missing token are friendly errors", async () => {
  const { client, calls } = fakeSupabase({});
  const failed = await signInWithAppleNative(client, {
    authorize: async () => {
      throw new Error("The plugin exploded");
    },
  });
  assert.equal(failed.status, "error");

  const noToken = await signInWithAppleNative(client, {
    authorize: async () => authorization({ identityToken: "" }),
  });
  assert.equal(noToken.status, "error");
  assert.equal(calls.signIn.length, 0);
});

test("Supabase rejecting the token is reported without leaking its internals", async () => {
  const { client } = fakeSupabase({ signInError: { message: "Nonces mismatch" } });
  const result = await signInWithAppleNative(client, { authorize: async () => authorization() });
  assert.equal(result.status, "error");
  assert.ok(result.status === "error" && !/nonce/i.test(result.message));

  const disabled = fakeSupabase({ signInError: { message: "Unsupported provider: provider is not enabled" } });
  const r2 = await signInWithAppleNative(disabled.client, { authorize: async () => authorization() });
  assert.ok(r2.status === "error" && /ainda não está disponível/.test(r2.message));
});

// ---- TEMP-APPLE-DEBUG: the [APPLE-DEBUG] logs must never contain secrets ----
import { describeError } from "./apple-sign-in";

function captureLogs<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return run()
    .then((result) => ({ result, lines }))
    .finally(() => {
      console.log = original;
    });
}

const SECRET_TOKEN = "SECRET-ID-TOKEN-XYZ";
const SECRET_CODE = "SECRET-AUTH-CODE-XYZ";
const SECRET_NONCE = "SECRET-RAW-NONCE-XYZ";

test("[APPLE-DEBUG] logs every step of a successful flow without leaking secrets", async () => {
  const { client } = fakeSupabase({});
  const { result, lines } = await captureLogs(() =>
    signInWithAppleNative(client, {
      createNonce: () => createNoncePair(SECRET_NONCE),
      authorize: async () =>
        authorization({ identityToken: SECRET_TOKEN, authorizationCode: SECRET_CODE, givenName: "Maria" }),
    }),
  );
  assert.deepEqual(result, { status: "signed-in" });
  const all = lines.join("\n");
  for (const step of ["1/9", "2/9", "3/9", "4/9", "6/9", "7/9", "8/9"]) {
    assert.ok(lines.some((l) => l.startsWith("[APPLE-DEBUG]") && l.includes(step)), `missing step ${step}`);
  }
  assert.ok(all.includes('"identityTokenPresent":true'));
  assert.ok(all.includes(`"identityTokenLength":${SECRET_TOKEN.length}`));
  assert.ok(all.includes('"authorizationCodePresent":true'));
  for (const secret of [SECRET_TOKEN, SECRET_CODE, SECRET_NONCE]) {
    assert.ok(!all.includes(secret), `a secret leaked into the logs: ${secret}`);
  }
});

test("[APPLE-DEBUG] logs the plugin error fields, and the Supabase error fields, without secrets", async () => {
  const pluginFailure = Object.assign(new Error("plugin boom"), { code: "UNIMPLEMENTED", localizedDescription: "nope" });
  const { lines: pluginLines } = await captureLogs(() =>
    signInWithAppleNative(fakeSupabase({}).client, {
      authorize: async () => {
        throw pluginFailure;
      },
    }),
  );
  const pluginText = pluginLines.join("\n");
  assert.ok(pluginText.includes("5/9"));
  assert.ok(pluginText.includes("plugin boom") && pluginText.includes("UNIMPLEMENTED") && pluginText.includes("localizedDescription"));

  const supabaseError = Object.assign(new Error("Unacceptable audience in id_token: [x]"), {
    name: "AuthApiError",
    status: 400,
    code: "validation_failed",
  });
  const fake = fakeSupabase({});
  fake.client.auth.signInWithIdToken = async () => ({ data: { user: null }, error: supabaseError });
  const { lines } = await captureLogs(() =>
    signInWithAppleNative(fake.client, {
      createNonce: () => createNoncePair(SECRET_NONCE),
      authorize: async () => authorization({ identityToken: SECRET_TOKEN, authorizationCode: SECRET_CODE }),
    }),
  );
  const text = lines.join("\n");
  assert.ok(text.includes("7/9") && text.includes("FALHOU"));
  for (const expected of ["AuthApiError", "validation_failed", "400", "Unacceptable audience"]) {
    assert.ok(text.includes(expected), `missing ${expected}`);
  }
  for (const secret of [SECRET_TOKEN, SECRET_CODE, SECRET_NONCE]) assert.ok(!text.includes(secret));
});

test("[APPLE-DEBUG] a general exception is logged and rethrown (behaviour unchanged)", async () => {
  const fake = fakeSupabase({});
  fake.client.auth.signInWithIdToken = async () => {
    throw new TypeError("Load failed");
  };
  const { lines } = await captureLogs(async () => {
    await assert.rejects(
      signInWithAppleNative(fake.client, { authorize: async () => authorization() }),
      /Load failed/,
    );
  });
  const text = lines.join("\n");
  assert.ok(text.includes("8/9 EXCEÇÃO GERAL") && text.includes("TypeError") && text.includes("Load failed"));
});

test("[APPLE-DEBUG] an error message that echoes a JWT is redacted", async () => {
  const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
  const { lines } = await captureLogs(() =>
    signInWithAppleNative(fakeSupabase({}).client, {
      authorize: async () => {
        throw new Error(`bad token ${jwt}`);
      },
    }),
  );
  const text = lines.join("\n");
  assert.ok(!text.includes(jwt) && text.includes("[jwt-redacted]"));
  assert.equal(describeError(null).error, "null");
});

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

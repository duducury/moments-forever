import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  NATIVE_OAUTH_CALLBACK_SCHEME,
  NATIVE_OAUTH_CANCELLED_MESSAGE,
  NATIVE_OAUTH_REDIRECT_URL,
  isNativeOAuthAvailable,
  parseNativeOAuthCallback,
  signInWithNativeOAuth,
  webCallbackPath,
  type NativeOAuthSupabaseClient,
} from "./native-oauth";

const SUPABASE_URL = "https://abcd1234.supabase.co";
const AUTHORIZE_URL = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=x`;
const CODE = "7b1f6c62-3a39-4a2e-9d34-0c1f0e5d3b11";

function fakeClient(
  response: Awaited<ReturnType<NativeOAuthSupabaseClient["auth"]["signInWithOAuth"]>>,
  seen: unknown[] = [],
): NativeOAuthSupabaseClient {
  return {
    auth: {
      async signInWithOAuth(credentials) {
        seen.push(credentials);
        return response;
      },
    },
  };
}

test("the callback URL is the fixed app scheme", () => {
  assert.equal(NATIVE_OAUTH_REDIRECT_URL, "com.momentsforever.app://auth/callback");
});

test("only the iOS app WITH the native plugin uses the native flow", () => {
  const ios = (plugin: boolean) => ({
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    isPluginAvailable: (name: string) => plugin && name === "MomentsNativeAuth",
  });
  assert.equal(isNativeOAuthAvailable(ios(true)), true);
  assert.equal(isNativeOAuthAvailable(ios(false)), false, "app 3.2 and older keep the old flow");
  assert.equal(isNativeOAuthAvailable(undefined), false, "plain browser");
  assert.equal(
    isNativeOAuthAvailable({ isNativePlatform: () => false, getPlatform: () => "web", isPluginAvailable: () => true }),
    false,
  );
  assert.equal(
    isNativeOAuthAvailable({ isNativePlatform: () => true, getPlatform: () => "android", isPluginAvailable: () => true }),
    false,
  );
});

test("parseNativeOAuthCallback extracts only the code, from exactly the right URL", () => {
  assert.deepEqual(parseNativeOAuthCallback(`com.momentsforever.app://auth/callback?code=${CODE}`), {
    status: "code",
    code: CODE,
  });
  assert.deepEqual(
    parseNativeOAuthCallback(`com.momentsforever.app://auth/callback?code=${CODE}&state=ignored&next=//evil`),
    { status: "code", code: CODE },
  );
  assert.deepEqual(
    parseNativeOAuthCallback("com.momentsforever.app://auth/callback?error=server_error&error_description=x"),
    { status: "error" },
  );
});

test("parseNativeOAuthCallback rejects anything else", () => {
  for (const raw of [
    "",
    "not a url",
    `https://momentsforever.vercel.app/auth/callback?code=${CODE}`,
    `evil.scheme://auth/callback?code=${CODE}`,
    `com.momentsforever.app://evil/callback?code=${CODE}`,
    `com.momentsforever.app://auth/other?code=${CODE}`,
    `com.momentsforever.app://auth/callback/extra?code=${CODE}`,
    `com.momentsforever.app://user:pw@auth/callback?code=${CODE}`,
    `com.momentsforever.app://auth:99/callback?code=${CODE}`,
    "com.momentsforever.app://auth/callback",
    "com.momentsforever.app://auth/callback?code=",
    "com.momentsforever.app://auth/callback?code=short",
    "com.momentsforever.app://auth/callback?code=has%20space%20and%3Cbad%3E",
    `com.momentsforever.app://auth/callback?code=${"a".repeat(600)}`,
  ]) {
    assert.deepEqual(parseNativeOAuthCallback(raw), { status: "invalid" }, raw);
  }
});

test("webCallbackPath continues through the existing /auth/callback route", () => {
  assert.equal(webCallbackPath(CODE), `/auth/callback?code=${CODE}`);
  assert.equal(webCallbackPath(CODE, "/ativar"), `/auth/callback?code=${CODE}&next=%2Fativar`);
});

test("full flow: sheet returns a code → the web view opens /auth/callback", async () => {
  const seen: unknown[] = [];
  const started: string[] = [];
  const navigated: string[] = [];
  const result = await signInWithNativeOAuth(
    fakeClient({ data: { url: AUTHORIZE_URL }, error: null }, seen),
    "google",
    {
      supabaseUrl: SUPABASE_URL,
      start: async (url) => {
        started.push(url);
        return `com.momentsforever.app://auth/callback?code=${CODE}`;
      },
      navigate: (target) => navigated.push(target),
    },
  );
  assert.deepEqual(result, { status: "redirecting" });
  assert.deepEqual(seen, [
    {
      provider: "google",
      options: {
        redirectTo: "com.momentsforever.app://auth/callback",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    },
  ]);
  assert.deepEqual(started, [AUTHORIZE_URL]);
  assert.deepEqual(navigated, [`/auth/callback?code=${CODE}`]);
});

test("Facebook does not get the Google-only account chooser parameter", async () => {
  const seen: unknown[] = [];
  await signInWithNativeOAuth(fakeClient({ data: { url: AUTHORIZE_URL }, error: null }, seen), "facebook", {
    supabaseUrl: SUPABASE_URL,
    start: async () => `com.momentsforever.app://auth/callback?code=${CODE}`,
    navigate: () => undefined,
  });
  assert.deepEqual(seen, [
    {
      provider: "facebook",
      options: { redirectTo: "com.momentsforever.app://auth/callback", skipBrowserRedirect: true },
    },
  ]);
});

test("the activation flow keeps its destination", async () => {
  const navigated: string[] = [];
  await signInWithNativeOAuth(fakeClient({ data: { url: AUTHORIZE_URL }, error: null }), "facebook", {
    supabaseUrl: SUPABASE_URL,
    next: "/ativar",
    start: async () => `com.momentsforever.app://auth/callback?code=${CODE}`,
    navigate: (target) => navigated.push(target),
  });
  assert.deepEqual(navigated, [`/auth/callback?code=${CODE}&next=%2Fativar`]);
});

test("closing the sheet is a cancellation, not an error", async () => {
  const navigated: string[] = [];
  const result = await signInWithNativeOAuth(fakeClient({ data: { url: AUTHORIZE_URL }, error: null }), "google", {
    supabaseUrl: SUPABASE_URL,
    start: async () => {
      throw Object.assign(new Error("Login cancelled."), { code: "CANCELLED" });
    },
    navigate: (target) => navigated.push(target),
  });
  assert.deepEqual(result, { status: "cancelled", message: "O login foi cancelado. Tente novamente." });
  assert.equal(NATIVE_OAUTH_CANCELLED_MESSAGE, "O login foi cancelado. Tente novamente.");
  assert.deepEqual(navigated, []);
});

test("saying no on the provider's page is also a calm cancellation, not an error", async () => {
  assert.deepEqual(
    parseNativeOAuthCallback("com.momentsforever.app://auth/callback?error=access_denied&error_description=denied"),
    { status: "cancelled" },
  );
  const navigated: string[] = [];
  const result = await signInWithNativeOAuth(fakeClient({ data: { url: AUTHORIZE_URL }, error: null }), "facebook", {
    supabaseUrl: SUPABASE_URL,
    start: async () => "com.momentsforever.app://auth/callback?error=access_denied",
    navigate: (target) => navigated.push(target),
  });
  assert.deepEqual(result, { status: "cancelled", message: NATIVE_OAUTH_CANCELLED_MESSAGE });
  assert.deepEqual(navigated, []);
});

test("both forms show the cancellation message (and keep the web flow untouched)", () => {
  for (const file of ["src/components/auth-form.tsx", "src/app/ativar/activation-form.tsx"]) {
    const source = readFileSync(path.join(WEB, file), "utf8");
    assert.match(source, /setMessage\(result\.message\)/, file);
  }
});

test("a bad callback or a failure never navigates", async () => {
  for (const start of [
    async () => "com.momentsforever.app://auth/callback?error=server_error",
    async () => "https://evil.example/?code=12345678",
    async () => {
      throw new Error("boom");
    },
  ]) {
    const navigated: string[] = [];
    const result = await signInWithNativeOAuth(fakeClient({ data: { url: AUTHORIZE_URL }, error: null }), "google", {
      supabaseUrl: SUPABASE_URL,
      start,
      navigate: (target) => navigated.push(target),
    });
    assert.equal(result.status, "error");
    assert.deepEqual(navigated, []);
  }
});

test("the authorize URL must be https on the Supabase host before the sheet opens", async () => {
  for (const url of [
    "https://evil.example/auth/v1/authorize",
    "http://abcd1234.supabase.co/auth/v1/authorize",
    "javascript:alert(1)",
    null,
  ]) {
    let opened = false;
    const result = await signInWithNativeOAuth(fakeClient({ data: { url }, error: null }), "google", {
      supabaseUrl: SUPABASE_URL,
      start: async () => {
        opened = true;
        return "";
      },
      navigate: () => {},
    });
    assert.equal(result.status, "error", String(url));
    assert.equal(opened, false, String(url));
  }
  const noConfig = await signInWithNativeOAuth(fakeClient({ data: { url: AUTHORIZE_URL }, error: null }), "google", {
    supabaseUrl: undefined,
    start: async () => "",
    navigate: () => {},
  });
  assert.equal(noConfig.status, "error");
});

test("Supabase errors are surfaced; a disabled provider gets the friendly message", async () => {
  const disabled = await signInWithNativeOAuth(
    fakeClient({ data: null, error: { message: "Unsupported provider: provider is not enabled" } }),
    "facebook",
    { supabaseUrl: SUPABASE_URL },
  );
  assert.deepEqual(disabled, { status: "error", message: "Login com esse provedor ainda não está disponível." });
  const other = await signInWithNativeOAuth(fakeClient({ data: null, error: { message: "rate limit" } }), "google", {
    supabaseUrl: SUPABASE_URL,
  });
  assert.deepEqual(other, { status: "error", message: "rate limit" });
});

// ---- Wiring: the web flow and Apple stay as they were ----------------------

const WEB = path.resolve(__dirname, "../../..");

test("both login forms use the native flow only when available and keep the web redirect otherwise", () => {
  for (const file of ["src/components/auth-form.tsx", "src/app/ativar/activation-form.tsx"]) {
    const source = readFileSync(path.join(WEB, file), "utf8");
    assert.match(source, /if \(isNativeOAuthAvailable\(\)\)/, file);
    assert.match(source, /window\.location\.origin\}\/auth\/callback/, `${file} keeps the web redirectTo`);
    assert.match(source, /signInWithAppleNative\(authClient\)/, `${file} keeps native Apple`);
  }
});

test("the native plugin pins the scheme and only accepts https login pages", () => {
  const swift = readFileSync(
    path.resolve(WEB, "../../packages/capacitor-native-auth/ios/Sources/MomentsNativeAuthPlugin/MomentsNativeAuthPlugin.swift"),
    "utf8",
  );
  assert.match(swift, /callbackScheme = "com\.momentsforever\.app"/);
  assert.match(swift, /url\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(swift, /ASWebAuthenticationSession\(/);
  assert.match(swift, /jsName = "MomentsNativeAuth"/);
});

test("Info.plist registers the callback scheme (and only that one) under CFBundleURLTypes", () => {
  const plist = readFileSync(path.join(WEB, "ios/App/App/Info.plist"), "utf8");
  const block = plist.match(/<key>CFBundleURLTypes<\/key>\s*<array>([\s\S]*?)<\/array>\s*(?=<key>)/)?.[1];
  assert.ok(block, "CFBundleURLTypes is present");
  const schemes = block.match(/<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1];
  assert.ok(schemes, "CFBundleURLSchemes is present");
  assert.deepEqual(
    [...schemes.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]),
    [NATIVE_OAUTH_CALLBACK_SCHEME],
  );
  // Nothing else read from this scheme: no JS App plugin, and Universal Links stay https.
  assert.equal([...block.matchAll(/<key>CFBundleURLSchemes<\/key>/g)].length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  hasAuthCookie,
  NATIVE_LAUNCH_STORAGE_KEY,
  NATIVE_LAUNCH_TARGET,
  nativeLaunchRedirectScript,
  shouldRedirectOnNativeLaunch,
  supabaseAuthCookieName,
} from "./native-launch";

const COOKIE = "sb-abcdefgh-auth-token";

test("supabaseAuthCookieName follows the supabase-js default storage key", () => {
  assert.equal(supabaseAuthCookieName("https://abcdefgh.supabase.co"), COOKIE);
  assert.equal(supabaseAuthCookieName("http://127.0.0.1:54321"), "sb-127-auth-token");
  assert.equal(supabaseAuthCookieName("not a url"), null);
});

test("hasAuthCookie matches the cookie and its chunks, nothing else", () => {
  assert.equal(hasAuthCookie(`a=1; ${COOKIE}=base64-xyz`, COOKIE), true);
  assert.equal(hasAuthCookie(`${COOKIE}.0=aaa; ${COOKIE}.1=bbb`, COOKIE), true);
  assert.equal(hasAuthCookie("a=1; other=2", COOKIE), false);
  assert.equal(hasAuthCookie("", COOKIE), false);
  assert.equal(hasAuthCookie(`${COOKIE}-extra=1`, COOKIE), false);
  assert.equal(hasAuthCookie(`x${COOKIE}=1`, COOKIE), false);
});

test("shouldRedirectOnNativeLaunch needs every condition", () => {
  const all = { isNative: true, pathname: "/", hasSessionCookie: true, alreadyHandled: false };
  assert.equal(shouldRedirectOnNativeLaunch(all), true);
  assert.equal(shouldRedirectOnNativeLaunch({ ...all, isNative: false }), false);
  assert.equal(shouldRedirectOnNativeLaunch({ ...all, pathname: "/login" }), false);
  assert.equal(shouldRedirectOnNativeLaunch({ ...all, pathname: "/n/abc" }), false);
  assert.equal(shouldRedirectOnNativeLaunch({ ...all, hasSessionCookie: false }), false);
  assert.equal(shouldRedirectOnNativeLaunch({ ...all, alreadyHandled: true }), false);
});

/** Executes the real inline script against a fake browser. */
function run(opts: {
  native?: boolean | "no-capacitor" | "throws";
  pathname?: string;
  cookie?: string;
  handled?: boolean;
  storageThrows?: boolean;
}) {
  const replaced: string[] = [];
  const store = new Map<string, string>();
  if (opts.handled) store.set(NATIVE_LAUNCH_STORAGE_KEY, "1");
  const capacitor =
    opts.native === "no-capacitor"
      ? undefined
      : {
          isNativePlatform: () => {
            if (opts.native === "throws") throw new Error("boom");
            return opts.native ?? true;
          },
        };
  const win = {
    Capacitor: capacitor,
    sessionStorage: {
      getItem: (k: string) => {
        if (opts.storageThrows) throw new Error("denied");
        return store.get(k) ?? null;
      },
      setItem: (k: string, v: string) => store.set(k, v),
    },
  };
  new Function("window", "location", "document", nativeLaunchRedirectScript(COOKIE))(
    win,
    { pathname: opts.pathname ?? "/", replace: (u: string) => replaced.push(u) },
    { cookie: opts.cookie ?? "" },
  );
  return { replaced, store };
}

test("native app + session cookie on / → straight to the profile entry, once", () => {
  const first = run({ cookie: `${COOKIE}=base64-x` });
  assert.deepEqual(first.replaced, [NATIVE_LAUNCH_TARGET]);
  assert.equal(first.store.get(NATIVE_LAUNCH_STORAGE_KEY), "1");

  const again = run({ cookie: `${COOKIE}=base64-x`, handled: true });
  assert.deepEqual(again.replaced, [], "a reload / second load must not loop or trap the user");
});

test("chunked session cookie counts", () => {
  assert.deepEqual(run({ cookie: `${COOKIE}.0=a; ${COOKIE}.1=b` }).replaced, [NATIVE_LAUNCH_TARGET]);
});

test("signed-out visitor (no cookie) is left exactly as before", () => {
  const r = run({ cookie: "theme=dark; other=1" });
  assert.deepEqual(r.replaced, []);
  assert.equal(r.store.size, 0, "must not even touch storage");
});

test("plain browser / PWA (not the Capacitor shell) is untouched", () => {
  assert.deepEqual(run({ native: false, cookie: `${COOKIE}=x` }).replaced, []);
  assert.deepEqual(run({ native: "no-capacitor", cookie: `${COOKIE}=x` }).replaced, []);
});

test("only the landing path is affected — never NFC links or other routes", () => {
  for (const pathname of ["/n/abc123", "/perfil", "/login", "/perfil/trip/album/1", "/ana"]) {
    assert.deepEqual(run({ pathname, cookie: `${COOKIE}=x` }).replaced, [], pathname);
  }
});

test("never throws and never redirects when the environment misbehaves", () => {
  assert.deepEqual(run({ native: "throws", cookie: `${COOKIE}=x` }).replaced, []);
  assert.deepEqual(run({ storageThrows: true, cookie: `${COOKIE}=x` }).replaced, []);
});

import assert from "node:assert/strict";
import test from "node:test";

import { NfcWriteCancelledError, performNativeWrite, type NativeNfcWriter } from "./native-nfc";

type Status = "ENABLED" | "DISABLED" | "NOT_SUPPORTED";

/** A fake plugin whose events the test fires by hand, like the real one does after a tag is touched. */
function fakePlugin(options: { status?: Status; writeRejects?: Error } = {}) {
  let onWrite: (() => void) | null = null;
  let onError: ((error: { error: string }) => void) | null = null;
  const calls: string[] = [];
  const plugin: NativeNfcWriter = {
    NFC: {
      async getStatus() {
        calls.push("getStatus");
        return { status: options.status ?? "ENABLED" };
      },
      async writeNDEF(request) {
        calls.push(`writeNDEF:${request.records[0]?.payload}`);
        if (options.writeRejects) throw options.writeRejects;
        return undefined; // resolves at once, as the Android plugin does: NOT a write confirmation
      },
      onWrite(listener) {
        onWrite = listener;
        return () => {
          onWrite = null;
        };
      },
      onError(listener) {
        onError = listener;
        return () => {
          onError = null;
        };
      },
      async cancelWriteAndroid() {
        calls.push("cancelWriteAndroid");
      },
    },
  };
  return {
    plugin,
    calls,
    fireWrite: () => onWrite?.(),
    fireError: (message: string) => onError?.({ error: message }),
    listening: () => onWrite !== null || onError !== null,
  };
}

const settleSoon = () => new Promise((resolve) => setTimeout(resolve, 5));

test("the write is NOT reported done until the plugin's write-success event arrives", async () => {
  const fake = fakePlugin();
  let done = false;
  const write = performNativeWrite(fake.plugin, "https://example.test/n/abc", { platform: "android" }).then(() => {
    done = true;
  });
  await settleSoon();
  assert.equal(done, false, "writeNDEF resolving must not count as success");
  assert.deepEqual(fake.calls, ["getStatus", "writeNDEF:https://example.test/n/abc"]);
  fake.fireWrite();
  await write;
  assert.equal(done, true);
  assert.equal(fake.listening(), false, "listeners are removed once it settled");
});

test("a plugin error event rejects with its message and cleans up", async () => {
  const fake = fakePlugin();
  const write = performNativeWrite(fake.plugin, "u", { platform: "ios" });
  await settleSoon();
  fake.fireError("NFC tag is not writable");
  await assert.rejects(write, /not writable/);
  assert.equal(fake.listening(), false);
});

test("a writeNDEF call that itself rejects fails the write", async () => {
  const fake = fakePlugin({ writeRejects: new Error("boom") });
  await assert.rejects(performNativeWrite(fake.plugin, "u", { platform: "ios" }), /boom/);
  assert.equal(fake.listening(), false);
});

test("aborting while waiting for a tag rejects as cancelled and cancels the pending Android write", async () => {
  const fake = fakePlugin();
  const controller = new AbortController();
  const write = performNativeWrite(fake.plugin, "u", { platform: "android", signal: controller.signal });
  await settleSoon();
  controller.abort();
  await assert.rejects(write, (error) => error instanceof NfcWriteCancelledError);
  assert.ok(fake.calls.includes("cancelWriteAndroid"), "the plugin must stop waiting, or the next tag would be overwritten");
  assert.equal(fake.listening(), false);
  fake.fireWrite(); // a late event after cancelling changes nothing
});

test("on iOS an abort only stops waiting: no Android cancel call", async () => {
  const fake = fakePlugin();
  const controller = new AbortController();
  const write = performNativeWrite(fake.plugin, "u", { platform: "ios", signal: controller.signal });
  await settleSoon();
  controller.abort();
  await assert.rejects(write, (error) => error instanceof NfcWriteCancelledError);
  assert.ok(!fake.calls.includes("cancelWriteAndroid"));
  assert.ok(!fake.calls.includes("getStatus"), "the status check is Android-only");
});

test("an already aborted signal never starts a write", async () => {
  const fake = fakePlugin();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    performNativeWrite(fake.plugin, "u", { platform: "android", signal: controller.signal }),
    (error) => error instanceof NfcWriteCancelledError,
  );
  assert.deepEqual(fake.calls, []);
});

test("Android with NFC off or missing says so instead of waiting for a tag", async () => {
  const off = fakePlugin({ status: "DISABLED" });
  await assert.rejects(performNativeWrite(off.plugin, "u", { platform: "android" }), /desligado/);
  assert.ok(!off.calls.some((call) => call.startsWith("writeNDEF")));
  const missing = fakePlugin({ status: "NOT_SUPPORTED" });
  await assert.rejects(performNativeWrite(missing.plugin, "u", { platform: "android" }), /não tem NFC/);
});

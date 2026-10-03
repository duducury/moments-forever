import assert from "node:assert/strict";
import test from "node:test";

import {
  CENTER_FOCUS,
  clampFocus,
  focusObjectPosition,
  isCenterFocus,
  loadCoverFocusByAlbum,
} from "./cover-focus";

test("clampFocus keeps values in 0..100, rounds to one decimal, and centres garbage", () => {
  assert.deepEqual(clampFocus({ x: 12.34, y: 87.66 }), { x: 12.3, y: 87.7 });
  assert.deepEqual(clampFocus({ x: -20, y: 250 }), { x: 0, y: 100 });
  assert.deepEqual(clampFocus({ x: "abc", y: null }), CENTER_FOCUS);
  assert.deepEqual(clampFocus({ x: "30", y: undefined }), { x: 30, y: 50 });
});

test("object-position is only produced for an off-centre focus", () => {
  assert.equal(focusObjectPosition(null), undefined);
  assert.equal(focusObjectPosition(undefined), undefined);
  assert.equal(focusObjectPosition({ x: 50, y: 50 }), undefined);
  assert.equal(focusObjectPosition({ x: 20, y: 65.5 }), "20% 65.5%");
  assert.equal(focusObjectPosition({ x: 999, y: -5 }), "100% 0%");
  assert.equal(isCenterFocus(null), true);
  assert.equal(isCenterFocus({ x: 50, y: 51 }), false);
});

function fakeClient(result: { data: unknown; error: unknown } | "throw") {
  return {
    from: () => ({
      select: () => ({
        in: async () => {
          if (result === "throw") throw new Error("network");
          return result;
        },
      }),
    }),
  } as unknown as Parameters<typeof loadCoverFocusByAlbum>[0];
}

test("loadCoverFocusByAlbum maps rows by album id", async () => {
  const map = await loadCoverFocusByAlbum(
    fakeClient({ data: [{ album_id: "a1", focus_x: 30, focus_y: 70 }], error: null }),
    ["a1", "a2"],
  );
  assert.deepEqual(map.get("a1"), { x: 30, y: 70 });
  assert.equal(map.has("a2"), false);
});

test("it is optional: missing table, errors and exceptions all just mean 'centred'", async () => {
  const missing = { message: 'relation "album_cover_focus" does not exist' };
  assert.equal((await loadCoverFocusByAlbum(fakeClient({ data: null, error: missing }), ["a"])).size, 0);
  assert.equal((await loadCoverFocusByAlbum(fakeClient("throw"), ["a"])).size, 0);
  assert.equal((await loadCoverFocusByAlbum(fakeClient({ data: [], error: null }), [])).size, 0);
});

import assert from "node:assert/strict";
import test from "node:test";

import { describePinContent, safePinThumbUrl } from "./pin-content";

test("thumbnail URLs: only the media proxy path, blob: and https are accepted", () => {
  assert.equal(safePinThumbUrl("/api/media/abc?variant=thumbnail"), "/api/media/abc?variant=thumbnail");
  assert.equal(safePinThumbUrl("blob:https://momentsforever.vercel.app/1234-5678"), "blob:https://momentsforever.vercel.app/1234-5678");
  assert.equal(safePinThumbUrl("https://cdn.example/x.jpg"), "https://cdn.example/x.jpg");
});

test("thumbnail URLs: script, data, protocol-relative, http and control characters are refused", () => {
  for (const bad of [
    "javascript:alert(1)",
    " JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.example/x.png",
    "/\\evil.example/x.png",
    "http://insecure.example/x.png",
    'x" onerror="alert(1)',
    "/ok\n.png",
    "",
    "   ",
  ]) {
    assert.equal(safePinThumbUrl(bad), null, JSON.stringify(bad));
  }
  assert.equal(safePinThumbUrl(undefined), null);
  assert.equal(safePinThumbUrl("/a".padEnd(3000, "a")), null);
});

test("a pin with a safe thumbnail shows the photo, with a badge only for more than one photo", () => {
  assert.deepEqual(describePinContent({ thumbUrl: "/api/media/a?variant=thumbnail", count: 1 }), {
    kind: "photo",
    src: "/api/media/a?variant=thumbnail",
    badge: null,
  });
  assert.deepEqual(describePinContent({ thumbUrl: "/api/media/a?variant=thumbnail", count: 7 }), {
    kind: "photo",
    src: "/api/media/a?variant=thumbnail",
    badge: 7,
  });
});

test("a pin without a usable thumbnail shows the count as text, and markup in the URL never becomes content", () => {
  assert.deepEqual(describePinContent({ thumbUrl: undefined, count: 3 }), { kind: "count", text: "3" });
  assert.deepEqual(describePinContent({ thumbUrl: 'javascript:alert("x")', count: 2 }), { kind: "count", text: "2" });
  assert.deepEqual(describePinContent({ thumbUrl: undefined, count: Number.NaN }), { kind: "count", text: "0" });
});

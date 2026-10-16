import assert from "node:assert/strict";
import test from "node:test";

import {
  polaroidKeyframesCss,
  polaroidRotationDegrees,
} from "./polaroid-keyframes";

test("5 photos: slide out at 10 %, back at 20 %, z-order 1 from 10 % to 80 %", () => {
  const css = polaroidKeyframesCss(5);
  assert.match(css, /@keyframes mf-polaroid-slide-5\{10%\{transform:translateX\(120%\) rotate\(var\(--r\)\)\}0%,100%,20%\{transform:translateX\(0%\)/u);
  assert.match(css, /@keyframes mf-polaroid-z-5\{10%,20%\{z-index:1\}80%\{z-index:2\}\}/u);
  assert.match(css, /@keyframes mf-polaroid-z-last-5\{10%,20%\{z-index:1\}90%\{z-index:2\}\}/u);
});

test("3 photos: percentages scale with n", () => {
  const css = polaroidKeyframesCss(3);
  assert.match(css, /mf-polaroid-slide-3\{16\.667%\{/u);
  assert.match(css, /0%,100%,33\.333%\{/u);
  assert.match(css, /mf-polaroid-z-3\{16\.667%,33\.333%\{z-index:1\}66\.667%\{z-index:2\}/u);
});

test("rotation is stable and within the original -20..20 range", () => {
  assert.equal(polaroidRotationDegrees("abc"), polaroidRotationDegrees("abc"));
  for (const id of ["a", "b", "photo-1", "0f9c-77", "zzzzzzzz"]) {
    const r = polaroidRotationDegrees(id);
    assert.ok(r >= -20 && r <= 20, `${id}: ${r}`);
  }
});

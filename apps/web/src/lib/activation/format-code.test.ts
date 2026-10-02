import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVATION_CODE_PATTERN, formatActivationCode } from "./format-code";

test("formats typed input into MF-XXXX-XXXX-XX", () => {
  assert.equal(formatActivationCode(""), "");
  assert.equal(formatActivationCode("ab"), "MF-AB");
  assert.equal(formatActivationCode("abcd1234ef"), "MF-ABCD-1234-EF");
  assert.equal(formatActivationCode("mf-abcd-1234-ef"), "MF-ABCD-1234-EF");
  assert.equal(formatActivationCode("MFabcd1234efZZZ"), "MF-ABCD-1234-EF");
});

test("only a complete code matches the pattern", () => {
  assert.equal(ACTIVATION_CODE_PATTERN.test("MF-ABCD-1234-EF"), true);
  assert.equal(ACTIVATION_CODE_PATTERN.test("MF-ABCD-1234"), false);
  assert.equal(ACTIVATION_CODE_PATTERN.test("mf-abcd-1234-ef"), false);
});

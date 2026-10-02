import assert from "node:assert/strict";
import test from "node:test";

import { isOAuthReturn } from "./oauth-return";

test("a code param means we just came back from an OAuth login", () => {
  assert.equal(isOAuthReturn("?code=abc123"), true);
  assert.equal(isOAuthReturn("code=abc123&state=x"), true);
  assert.equal(isOAuthReturn("?foo=1&code=abc"), true);
});

test("normal visits to the landing page are not OAuth returns", () => {
  assert.equal(isOAuthReturn(""), false);
  assert.equal(isOAuthReturn("?"), false);
  assert.equal(isOAuthReturn("?code="), false);
  assert.equal(isOAuthReturn("?utm_source=x"), false);
  assert.equal(isOAuthReturn("?error=access_denied"), false);
});

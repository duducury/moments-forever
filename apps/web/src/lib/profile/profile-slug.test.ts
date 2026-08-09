import assert from "node:assert/strict";
import test from "node:test";

import {
  isReservedProfileSlug,
  publicProfilePath,
  slugifyDisplayName,
} from "./profile-slug";

test("slugifyDisplayName folds accents and spaces", () => {
  assert.equal(slugifyDisplayName("Eduardo Silva"), "eduardo-silva");
  assert.equal(slugifyDisplayName("José"), "jose");
  assert.equal(slugifyDisplayName("  Ana  "), "ana");
});

test("slugifyDisplayName avoids reserved roots", () => {
  assert.equal(slugifyDisplayName("login"), "login-user");
  assert.equal(slugifyDisplayName("perfil"), "perfil-user");
});

test("isReservedProfileSlug and publicProfilePath", () => {
  assert.equal(isReservedProfileSlug("import"), true);
  assert.equal(isReservedProfileSlug("eduardo"), false);
  assert.equal(publicProfilePath("eduardo"), "/eduardo");
});

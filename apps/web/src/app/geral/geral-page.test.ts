import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const GERAL = path.resolve(__dirname);
const page = readFileSync(path.join(GERAL, "page.tsx"), "utf8");
const client = readFileSync(path.join(GERAL, "geral-settings-client.tsx"), "utf8");
const header = readFileSync(path.join(GERAL, "../perfil/profile-header.tsx"), "utf8");

test("the admin flag comes from the existing server-side check, not from the client", () => {
  assert.match(page, /import \{ isAdminUser \} from "@\/lib\/licensing\/require-admin"/);
  assert.match(page, /const isAdmin = await isAdminUser\(supabase, user\.id\)/);
  assert.match(page, /isAdmin=\{isAdmin\}/);
  // No second permission system: nothing in the client decides who is an admin.
  assert.doesNotMatch(client, /is_admin|ADMIN_EMAILS|isAdminUser/);
});

test("the Administração section is not rendered at all for non-admins, and points at /admin", () => {
  const gate = client.indexOf("{isAdmin ? (");
  assert.ok(gate > -1, "the section is behind a conditional render");
  const section = client.slice(gate, client.indexOf(") : null}", gate));
  assert.match(section, /Administração/);
  assert.match(section, /href="\/admin"/);
  // The label and the link exist only inside that conditional.
  assert.equal(client.split('href="/admin"').length - 1, 1);
  assert.equal(client.split("Administração").length - 1 >= 2, true);
  assert.equal(client.slice(0, gate).includes("Administração"), false);
});

test("the Conta card opens the existing profile editor instead of the public profile", () => {
  assert.match(client, /import \{ EditProfileDialog \} from "\.\.\/perfil\/edit-profile-dialog"/);
  assert.match(client, /<EditProfileDialog/);
  assert.match(client, /onClick=\{\(\) => setEditProfileOpen\(true\)\}/);
  assert.doesNotMatch(client, /profileHref/);
  assert.doesNotMatch(page, /profileHref/);
  // Same fallback bio the profile home uses (single definition).
  assert.match(header, /export const DEFAULT_BIO/);
  assert.match(client, /import \{ DEFAULT_BIO \} from "\.\.\/perfil\/profile-header"/);
});

test("the profile home still opens the same editor from its own Editar button", () => {
  assert.match(header, /import \{ EditProfileDialog \} from "\.\/edit-profile-dialog"/);
  assert.match(header, /onClick=\{\(\) => setEditOpen\(true\)\}/);
  assert.match(header, /<EditProfileDialog/);
});

test("/admin itself stays protected by the existing guard on every page", () => {
  for (const file of ["page.tsx", "users/page.tsx", "plans/page.tsx", "codes/page.tsx", "reports/page.tsx"]) {
    const source = readFileSync(path.join(GERAL, "../admin", file), "utf8");
    assert.match(source, /requireAdminUser\(\)/, `admin/${file}`);
  }
});

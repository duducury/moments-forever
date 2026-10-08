import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { customPlanWhatsappHref } from "@/lib/pricing/custom-plan-request";

import { CUSTOM_PLAN_MAX_VALUE, parseCustomPlanInput } from "./custom-plan";
import { CUSTOM_PLAN_LABEL } from "./types";

const read = (file: string) => readFileSync(path.resolve(__dirname, "../../..", file), "utf8");

test("custom plan input: whole numbers only, 0 to the upper bound, explicit active flag", () => {
  const ok = parseCustomPlanInput({ maxTrips: 40, maxPhotosPerTrip: 200, maxNfcTags: 40, active: true });
  assert.deepEqual(ok, { ok: true, value: { maxTrips: 40, maxPhotosPerTrip: 200, maxNfcTags: 40, active: true } });
  for (const bad of [
    { maxTrips: -1, maxPhotosPerTrip: 1, maxNfcTags: 1, active: true },
    { maxTrips: 1.5, maxPhotosPerTrip: 1, maxNfcTags: 1, active: true },
    { maxTrips: "40", maxPhotosPerTrip: 1, maxNfcTags: 1, active: true },
    { maxTrips: 1, maxPhotosPerTrip: CUSTOM_PLAN_MAX_VALUE + 1, maxNfcTags: 1, active: true },
    { maxTrips: 1, maxPhotosPerTrip: 1, maxNfcTags: null, active: true },
    { maxTrips: 1, maxPhotosPerTrip: 1, maxNfcTags: 1 },
    null,
    "x",
  ]) {
    assert.equal(parseCustomPlanInput(bad).ok, false, JSON.stringify(bad));
  }
});

test("only the server, and only an admin, decides a custom plan", () => {
  const route = read("src/app/api/admin/users/[id]/custom-plan/route.ts");
  assert.match(route, /requireAdminUser\(\)/);
  assert.match(route, /if \(!admin\)[\s\S]{0,120}403/, "non-admins are refused before anything is read");
  assert.match(route, /admin_set_custom_plan/, "written through the admin-checked database function");
  assert.doesNotMatch(route, /user\.id\b.*p_user_id/, "the target comes from the URL, validated as a uuid");
  const migration = read("../../supabase/migrations/20261009100000_custom_plans.sql");
  assert.match(migration, /u\.is_admin/, "the database function re-checks that the caller is an admin");
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_set_custom_plan[\s\S]*GRANT EXECUTE/);
  assert.doesNotMatch(read("src/app/admin/users/custom-plan-form.tsx"), /supabase/i, "the form only calls the admin API");
});

test("custom plans never leak into public or sellable plan lists", () => {
  assert.match(read("src/app/admin/codes/page.tsx"), /is_custom", false/);
  assert.match(read("src/app/admin/plans/page.tsx"), /is_custom", false/);
  assert.match(read("src/app/api/admin/codes/route.ts"), /is_custom", false/);
  assert.match(read("src/app/api/admin/users/[id]/plan/route.ts"), /is_custom", false/);
  assert.match(read("src/app/admin/users/page.tsx"), /filter\(\(plan\) => !plan\.is_custom\)/);
  // The public pricing query needs a price label, which a custom plan never has.
  assert.match(read("src/lib/pricing/load-pricing-plans.ts"), /not\("price_label", "is", null\)/);
  assert.match(read("../../supabase/migrations/20261009100000_custom_plans.sql"), /VALUES\s*\(\s*'PERSONALIZADO-'[\s\S]*?false, true, p_user_id/);
});

test("a custom plan is shown as Personalizado, with the user's own limits", () => {
  assert.equal(CUSTOM_PLAN_LABEL, "Personalizado");
  const license = read("src/lib/licensing/get-user-license.ts");
  assert.match(license, /plan\.is_custom \? CUSTOM_PLAN_LABEL/);
  assert.match(license, /max_trips as number \| null\) \?\? \(plan\.max_nfc_tags/, "trip limit falls back to the NFC number for Basic/Plus/Premium");
  assert.match(read("src/app/api/experiences/from-import/route.ts"), /license\?\.maxTrips/);
});

test("Home: Basic, Plus and Premium stay as they are; a fourth, price-less card asks for a custom plan", () => {
  const section = read("src/app/pricing-section.tsx");
  assert.match(section, /plans\.map\(\(plan\) =>/, "the three plans still come from the database, unchanged");
  assert.match(section, /<CustomPlanCard \/>/);
  for (const text of ["Plano personalizado", "Mais viagens", "Mais fotos", "Mais tags NFC", "Plano ajustado à sua necessidade", "Montar meu plano"]) {
    assert.ok(section.includes(text), text);
  }
  const card = section.slice(section.indexOf("function CustomPlanCard"), section.indexOf("export function PricingSection"));
  assert.doesNotMatch(card, /US\$|priceLabel|pricingPrice/, "no fixed price on the custom card");
});

test("the request reuses the existing WhatsApp sales contact and carries what the person asked for", () => {
  const href = customPlanWhatsappHref({ name: "João Silva", email: "joao@exemplo.com", trips: "40", photosPerTrip: "200", nfcTags: "40" });
  assert.match(href, /^https:\/\/wa\.me\/12033947243\?text=/);
  const text = decodeURIComponent(href.split("text=")[1]!);
  for (const part of ["João Silva", "joao@exemplo.com", "Viagens: 40", "Fotos por viagem: 200", "Tags NFC: 40"]) {
    assert.ok(text.includes(part), part);
  }
});

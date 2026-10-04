import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  applyVersions,
  compareMarketing,
  highestBuild,
  isValidMarketingVersion,
  planBump,
  readVersions,
  singleValue,
} from "./ios-version";

const WEB_ROOT = path.resolve(__dirname, "../../..");
const PBXPROJ = path.join(WEB_ROOT, "ios/App/App.xcodeproj/project.pbxproj");
const INFO_PLIST = path.join(WEB_ROOT, "ios/App/App/Info.plist");

// ---- the rules ------------------------------------------------------------

test("marketing versions: 3.1 / 4.0 / 3.1.2 are valid; build-like or malformed values are not", () => {
  for (const ok of ["3.1", "3.2", "4.0", "3.1.2"]) assert.equal(isValidMarketingVersion(ok), true, ok);
  for (const bad of ["4", "3.", ".1", "3.1.2.1", "v3.1", "3.1-beta", ""]) {
    assert.equal(isValidMarketingVersion(bad), false, bad);
  }
});

test("compareMarketing orders numerically, not as text", () => {
  assert.ok(compareMarketing("3.10", "3.9") > 0);
  assert.ok(compareMarketing("3.1", "3.1.0") === 0);
  assert.ok(compareMarketing("3.1", "4.0") < 0);
});

const base = { currentMarketing: "1.0", currentBuild: 3, historyMaxBuild: 3 };

test("planBump accepts 3.1 / build 4 after 1.0 (3)", () => {
  assert.deepEqual(planBump({ ...base, nextMarketing: "3.1", nextBuild: 4 }), { errors: [], warnings: [] });
});

test("a build number can never be reused or go backwards", () => {
  for (const nextBuild of [3, 2, 1]) {
    assert.equal(planBump({ ...base, nextMarketing: "3.1", nextBuild }).errors.length, 1, String(nextBuild));
  }
  // a build used earlier in history counts even if the project file currently holds a lower one
  assert.equal(planBump({ ...base, currentBuild: 2, historyMaxBuild: 6, nextMarketing: "3.1", nextBuild: 6 }).errors.length, 1);
  assert.equal(planBump({ ...base, currentBuild: 2, historyMaxBuild: 6, nextMarketing: "3.1", nextBuild: 7 }).errors.length, 0);
});

test("the same marketing version may ship a new build; a lower marketing version may not", () => {
  assert.equal(planBump({ currentMarketing: "3.1", currentBuild: 4, historyMaxBuild: 4, nextMarketing: "3.1", nextBuild: 5 }).errors.length, 0);
  assert.equal(planBump({ currentMarketing: "3.1", currentBuild: 4, historyMaxBuild: 4, nextMarketing: "3.0", nextBuild: 5 }).errors.length, 1);
});

test("skipping build numbers only warns; non-integers are errors", () => {
  const jump = planBump({ ...base, nextMarketing: "3.1", nextBuild: 9 });
  assert.equal(jump.errors.length, 0);
  assert.equal(jump.warnings.length, 1);
  assert.equal(planBump({ ...base, nextMarketing: "3.1", nextBuild: 4.5 }).errors.length, 1);
  assert.equal(planBump({ ...base, nextMarketing: "3.1", nextBuild: Number.NaN }).errors.length, 1);
});

test("applyVersions rewrites every occurrence and nothing else", () => {
  const sample = [
    "\t\t\t\tCURRENT_PROJECT_VERSION = 3;",
    "\t\t\t\tMARKETING_VERSION = 1.0;",
    "\t\t\t\tPRODUCT_NAME = App;",
    "\t\t\t\tCURRENT_PROJECT_VERSION = 3;",
    "\t\t\t\tMARKETING_VERSION = 1.0;",
  ].join("\n");
  const out = applyVersions(sample, "3.1", 4);
  assert.deepEqual(readVersions(out), { marketing: ["3.1", "3.1"], builds: [4, 4] });
  assert.ok(out.includes("PRODUCT_NAME = App;"));
  assert.equal(applyVersions(out, "3.1", 4), out, "applying the same values twice changes nothing");
});

test("highestBuild looks through the whole history text; singleValue detects disagreement", () => {
  assert.equal(highestBuild(["CURRENT_PROJECT_VERSION = 1;\n-CURRENT_PROJECT_VERSION = 1;\n+CURRENT_PROJECT_VERSION = 3;"]), 3);
  assert.equal(highestBuild([]), 0);
  assert.equal(singleValue([4, 4]), 4);
  assert.equal(singleValue([4, 5]), null);
  assert.equal(singleValue([]), null);
});

// ---- the project itself ---------------------------------------------------

const project = readVersions(readFileSync(PBXPROJ, "utf8"));

test("project: Debug and Release agree on one valid MARKETING_VERSION and one build number", () => {
  assert.ok(project.marketing.length >= 2 && project.builds.length >= 2, "expected a Debug and a Release entry");
  const marketing = singleValue(project.marketing);
  const build = singleValue(project.builds);
  assert.ok(marketing && isValidMarketingVersion(marketing), `inconsistent/invalid MARKETING_VERSION: ${project.marketing}`);
  assert.ok(build !== null && Number.isInteger(build) && build >= 1, `inconsistent CURRENT_PROJECT_VERSION: ${project.builds}`);
});

test("project: Info.plist reads the version from the project settings (nothing hardcoded)", () => {
  const plist = readFileSync(INFO_PLIST, "utf8");
  const value = (key: string) => plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))?.[1];
  assert.equal(value("CFBundleShortVersionString"), "$(MARKETING_VERSION)");
  assert.equal(value("CFBundleVersion"), "$(CURRENT_PROJECT_VERSION)");
});

test("project: the build number never goes below one already committed to the project file", (t) => {
  let history: string;
  try {
    history = execFileSync("git", ["log", "-p", "--format=", "--", PBXPROJ], {
      cwd: path.dirname(PBXPROJ),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    t.skip("git history not available");
    return;
  }
  const build = singleValue(project.builds)!;
  assert.ok(build >= highestBuild([history]), `build ${build} is lower than one committed before — never reuse or lower a build`);
});

test("the app never displays its version: no source file reads the Xcode version settings", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (full !== path.join(WEB_ROOT, "src/lib/release")) walk(full);
      } else if (/\.(ts|tsx)$/.test(name) && /MARKETING_VERSION|CURRENT_PROJECT_VERSION|CFBundleShortVersionString/.test(readFileSync(full, "utf8"))) {
        offenders.push(path.relative(WEB_ROOT, full));
      }
    }
  };
  walk(path.join(WEB_ROOT, "src"));
  assert.deepEqual(offenders, []);
});

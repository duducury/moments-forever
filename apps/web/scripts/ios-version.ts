/**
 * Shows / checks / sets the iOS version and build number (rules: docs/releasing.md).
 *
 * Usage (from apps/web):
 *   npm run ios:version                 show current values and the next build number
 *   npm run ios:version -- check        fail if the project file is inconsistent
 *   npm run ios:version -- set 3.1 4    set MARKETING_VERSION 3.1 / CURRENT_PROJECT_VERSION 4
 *
 * `set` refuses a build number that was already used (current value or anything
 * ever committed to the project file) and a marketing version that goes backwards.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  applyVersions,
  highestBuild,
  planBump,
  readVersions,
  singleValue,
} from "../src/lib/release/ios-version";

const PBXPROJ = path.resolve(__dirname, "../ios/App/App.xcodeproj/project.pbxproj");

function gitHistoryTexts(): string[] {
  const log = execFileSync("git", ["log", "-p", "--format=", "--", PBXPROJ], {
    cwd: path.dirname(PBXPROJ),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return [log];
}

function current() {
  const text = readFileSync(PBXPROJ, "utf8");
  const versions = readVersions(text);
  return {
    text,
    marketing: singleValue(versions.marketing),
    build: singleValue(versions.builds),
    occurrences: versions.builds.length,
  };
}

const [command = "show", marketingArg, buildArg] = process.argv.slice(2);
const now = current();
const historyMax = highestBuild(gitHistoryTexts());

if (command === "show" || command === "check") {
  console.log(`MARKETING_VERSION      ${now.marketing ?? "INCONSISTENT"}`);
  console.log(`CURRENT_PROJECT_VERSION ${now.build ?? "INCONSISTENT"}`);
  console.log(`Highest build in git history: ${historyMax}`);
  console.log(`Next build number: ${Math.max(now.build ?? 0, historyMax) + 1}`);
  console.log("(Builds already uploaded to App Store Connect / Xcode Cloud are not visible here — see docs/releasing.md.)");
  if (command === "check" && (now.marketing === null || now.build === null || now.occurrences === 0)) {
    console.error("Project file has missing or inconsistent version values.");
    process.exit(1);
  }
} else if (command === "set") {
  if (!marketingArg || !buildArg) {
    console.error("Usage: npm run ios:version -- set <marketing> <build>   e.g. set 3.1 4");
    process.exit(1);
  }
  const plan = planBump({
    currentMarketing: now.marketing ?? "0.0",
    currentBuild: now.build ?? 0,
    historyMaxBuild: historyMax,
    nextMarketing: marketingArg,
    nextBuild: Number(buildArg),
  });
  plan.warnings.forEach((warning) => console.warn(`warning: ${warning}`));
  if (plan.errors.length > 0) {
    plan.errors.forEach((error) => console.error(`error: ${error}`));
    process.exit(1);
  }
  writeFileSync(PBXPROJ, applyVersions(now.text, marketingArg, Number(buildArg)));
  console.log(`Set MARKETING_VERSION ${marketingArg}, CURRENT_PROJECT_VERSION ${buildArg}.`);
} else {
  console.error(`Unknown command "${command}". Use: show | check | set <marketing> <build>`);
  process.exit(1);
}

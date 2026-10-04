/**
 * iOS app version rules (see docs/releasing.md).
 *
 * The single source of truth is ios/App/App.xcodeproj/project.pbxproj:
 * MARKETING_VERSION (public version, e.g. 3.1) and CURRENT_PROJECT_VERSION
 * (build number App Store Connect requires). Info.plist only reads them via
 * $(MARKETING_VERSION) / $(CURRENT_PROJECT_VERSION) — never hardcode either.
 */

export interface PbxprojVersions {
  readonly marketing: readonly string[];
  readonly builds: readonly number[];
}

/** Every MARKETING_VERSION / CURRENT_PROJECT_VERSION occurrence (Debug and Release each have one). */
export function readVersions(pbxproj: string): PbxprojVersions {
  return {
    marketing: [...pbxproj.matchAll(/MARKETING_VERSION = ([^;\s]+);/g)].map((m) => m[1]!),
    builds: [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1])),
  };
}

/** Public version: 2 or 3 numeric parts ("3.1", "3.1.2"). */
export function isValidMarketingVersion(value: string): boolean {
  return /^\d+\.\d+(\.\d+)?$/.test(value);
}

/** Negative if a < b, 0 if equal, positive if a > b (missing parts count as 0). */
export function compareMarketing(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The only value shared by every occurrence, or null when they disagree / are missing. */
export function singleValue<T>(values: readonly T[]): T | null {
  const first = values[0];
  return first !== undefined && values.every((value) => value === first) ? first : null;
}

/** Highest build number found in any of the given texts (e.g. the whole git history of the project file). */
export function highestBuild(texts: readonly string[]): number {
  let highest = 0;
  for (const text of texts) {
    for (const build of readVersions(text).builds) highest = Math.max(highest, build);
  }
  return highest;
}

export interface BumpInput {
  readonly currentMarketing: string;
  readonly currentBuild: number;
  /** Highest build ever committed for this project file. */
  readonly historyMaxBuild: number;
  readonly nextMarketing: string;
  readonly nextBuild: number;
}

export interface BumpPlan {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** Checks a version bump against the release rules. No errors = safe to apply. */
export function planBump(input: BumpInput): BumpPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lastUsed = Math.max(input.currentBuild, input.historyMaxBuild);

  if (!isValidMarketingVersion(input.nextMarketing)) {
    errors.push(`Marketing version "${input.nextMarketing}" is invalid — use 3.1, 3.2, 4.0 (digits and dots).`);
  } else if (
    isValidMarketingVersion(input.currentMarketing) &&
    compareMarketing(input.nextMarketing, input.currentMarketing) < 0
  ) {
    errors.push(`Marketing version cannot go backwards (${input.currentMarketing} -> ${input.nextMarketing}).`);
  }

  if (!Number.isInteger(input.nextBuild) || input.nextBuild < 1) {
    errors.push(`Build number "${input.nextBuild}" must be a positive integer.`);
  } else if (input.nextBuild <= lastUsed) {
    errors.push(
      `Build ${input.nextBuild} was already used (highest so far: ${lastUsed}). Use ${lastUsed + 1} or higher.`,
    );
  } else if (input.nextBuild !== lastUsed + 1) {
    warnings.push(`Build jumps from ${lastUsed} to ${input.nextBuild}; the rule is +1 per build sent.`);
  }

  return { errors, warnings };
}

/** Rewrites every MARKETING_VERSION and CURRENT_PROJECT_VERSION in the project file. */
export function applyVersions(pbxproj: string, marketing: string, build: number): string {
  return pbxproj
    .replace(/MARKETING_VERSION = [^;\s]+;/g, `MARKETING_VERSION = ${marketing};`)
    .replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
}

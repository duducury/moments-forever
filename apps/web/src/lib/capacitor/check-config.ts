/**
 * Checks the capacitor.config.json that `cap sync android` writes (and that ends up inside the APK as
 * assets/capacitor.config.json). A failed sync leaves the PREVIOUS file in place and Gradle still reports
 * BUILD SUCCESSFUL, so the address the app really loads has to be read back and compared.
 */

import { PRODUCTION_SERVER_URL, parseServerUrl } from "./server-url";

export interface ConfigCheck {
  /** `server.url` found in the file, or null when absent / unreadable. */
  readonly url: string | null;
  readonly problems: readonly string[];
  /** True when the app will load the production site. */
  readonly isProduction: boolean;
}

/**
 * @param jsonText contents of capacitor.config.json
 * @param expectedUrl the URL this build must use (already validated), or undefined to accept any valid one
 */
export function checkGeneratedConfig(jsonText: string, expectedUrl?: string): ConfigCheck {
  const problems: string[] = [];
  let config: { appId?: unknown; server?: { url?: unknown; cleartext?: unknown } };
  try {
    config = JSON.parse(jsonText) as typeof config;
  } catch {
    return { url: null, problems: ["capacitor.config.json is not valid JSON"], isProduction: false };
  }

  const raw = config.server?.url;
  if (typeof raw !== "string" || raw === "") {
    return { url: null, problems: ["server.url is missing: the app would try to open a bundled index.html"], isProduction: false };
  }

  const parsed = parseServerUrl(raw);
  if (!parsed.ok) {
    problems.push(`server.url "${raw}" is not usable: ${parsed.reason}`);
  } else if (parsed.url !== raw) {
    problems.push(`server.url "${raw}" is not in canonical form (expected "${parsed.url}")`);
  }
  if (expectedUrl !== undefined && raw !== expectedUrl) {
    problems.push(
      `server.url is "${raw}" but this build must use "${expectedUrl}": the sync did not update the file (did it fail?)`,
    );
  }
  if (config.appId !== "com.momentsforever.app") {
    problems.push(`appId is ${JSON.stringify(config.appId)}, expected "com.momentsforever.app"`);
  }
  if (config.server?.cleartext !== false) problems.push("server.cleartext must be false");

  return { url: raw, problems, isProduction: raw === PRODUCTION_SERVER_URL };
}

/**
 * Android App Links: https://momentsforever.vercel.app/.well-known/assetlinks.json tells Android which
 * app (package + signing certificate) may open the site's shared links. Counterpart of the iOS AASA
 * (src/lib/ios/universal-links.ts).
 *
 * The certificate fingerprint is a REAL value that only exists once the app is signed (Play Console →
 * Release → Setup → App signing → "App signing key certificate" SHA-256, plus the upload key's SHA-256 for
 * builds installed outside Play). It is NOT in the repository: set ANDROID_APP_SHA256_FINGERPRINTS on the
 * host (comma separated) and redeploy. Until then the file is `[]`: it verifies nothing and the links keep
 * opening in the browser. See docs/android-app-links.md.
 */

/** Same as the Capacitor appId / Android applicationId. */
export const ANDROID_PACKAGE_NAME = "com.momentsforever.app";

export type AssetLinkStatement = {
  readonly relation: readonly ["delegate_permission/common.handle_all_urls"];
  readonly target: {
    readonly namespace: "android_app";
    readonly package_name: string;
    readonly sha256_cert_fingerprints: readonly string[];
  };
};

/**
 * Accepts `AB:CD:…` (32 bytes) or 64 hex characters, in any case, separated by commas / spaces /
 * new lines. Anything that is not a SHA-256 fingerprint is dropped, never guessed. Output is the
 * canonical upper-case colon form Android expects; duplicates are removed.
 */
export function parseCertFingerprints(raw: string | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const hex = part.replace(/:/g, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) continue;
    // With colons it must be exactly the 2-hex-digit grouping.
    if (part.includes(":") && !/^([0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2}$/.test(part)) continue;
    out.add(hex.toUpperCase().match(/.{2}/g)!.join(":"));
  }
  return [...out];
}

export function buildAssetLinks(fingerprints: readonly string[]): AssetLinkStatement[] {
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

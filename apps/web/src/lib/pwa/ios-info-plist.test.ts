import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * The app is a WKWebView shell, and every `<input type="file" accept="image/*">`
 * offers "Take Photo" in the system picker. Without NSCameraUsageDescription iOS
 * kills the app the moment the camera is requested (App Review rejected 1.0 (2)
 * for exactly that crash on iPad). Keep the string in the plist.
 */
const INFO_PLIST = path.resolve(__dirname, "../../../ios/App/App/Info.plist");

function stringValueFor(plist: string, key: string): string | null {
  const match = plist.match(
    new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`),
  );
  return match?.[1] ?? null;
}

test("Info.plist declares why the app uses the camera (NSCameraUsageDescription)", () => {
  const description = stringValueFor(readFileSync(INFO_PLIST, "utf8"), "NSCameraUsageDescription");
  assert.ok(description, "NSCameraUsageDescription is missing from Info.plist");
  assert.ok(
    description.trim().length >= 10,
    "NSCameraUsageDescription must explain the purpose, not be empty",
  );
});

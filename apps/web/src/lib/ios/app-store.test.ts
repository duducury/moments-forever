import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { APP_STORE_URL, NATIVE_IOS_APP_ATTRIBUTE, nativeIosAppMarkerScript } from "./app-store";

function run(capacitor: unknown) {
  const attributes = new Map<string, string>();
  const window = { Capacitor: capacitor };
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
  };
  vm.runInNewContext(nativeIosAppMarkerScript(), { window, document });
  return attributes;
}

test("the download button points at the app's App Store page", () => {
  assert.equal(APP_STORE_URL, "https://apps.apple.com/us/app/moments-forever/id6817206704");
});

test("the marker is set inside the iOS app only", () => {
  const ios = { isNativePlatform: () => true, getPlatform: () => "ios" };
  assert.equal(run(ios).get(NATIVE_IOS_APP_ATTRIBUTE), "1");
  assert.equal(run(undefined).size, 0, "plain browser / desktop");
  assert.equal(run({ isNativePlatform: () => false, getPlatform: () => "web" }).size, 0);
  assert.equal(run({ isNativePlatform: () => true, getPlatform: () => "android" }).size, 0);
  assert.equal(run({}).size, 0);
  assert.doesNotThrow(() =>
    run({
      isNativePlatform: () => {
        throw new Error("boom");
      },
    }),
  );
});

test("the home page renders the button on the web and CSS hides it in the app", () => {
  const web = path.resolve(__dirname, "../../..");
  const page = readFileSync(path.join(web, "src/app/page.tsx"), "utf8");
  assert.match(page, /href=\{APP_STORE_URL\}/);
  assert.match(page, /Baixar o app/);
  assert.match(page, /Disponível na App Store/);
  const css = readFileSync(path.join(web, "src/app/home.module.css"), "utf8");
  assert.match(css, /:global\(html\[data-native-ios-app\]\) \.appStore\s*\{\s*display: none;/);
  const layout = readFileSync(path.join(web, "src/app/layout.tsx"), "utf8");
  assert.match(layout, /nativeIosAppMarkerScript\(\)/);
});

test("the bottom of the home page has a second App Store badge, hidden in the app, and the hero button stays", () => {
  const web = path.resolve(__dirname, "../../..");
  const page = readFileSync(path.join(web, "src/app/page.tsx"), "utf8");
  // Hero button kept…
  assert.match(page, /Baixar o app/);
  // …and the badge sits inside the footer, after the footer nav.
  const footer = page.slice(page.indexOf("<footer"), page.indexOf("</footer>"));
  assert.match(footer, /<HomeFooterNav \/>\s*<HomeAppStoreBadge \/>/);

  const badge = readFileSync(path.join(web, "src/app/home-app-store-badge.tsx"), "utf8");
  assert.match(badge, /href=\{APP_STORE_URL\}/);
  assert.match(badge, /Baixar na/);
  assert.match(badge, /App Store/);
  assert.match(badge, /<svg[\s\S]*<path d="M12\.152 6\.896/, "Apple logo");

  const css = readFileSync(path.join(web, "src/app/home.module.css"), "utf8");
  assert.match(css, /:global\(html\[data-native-ios-app\]\) \.footerStore\s*\{\s*display: none;/);
});


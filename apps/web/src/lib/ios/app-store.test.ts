import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("the download section sits right after the plans, the footer has no badge, and the hero button stays", () => {
  const web = path.resolve(__dirname, "../../..");
  const page = readFileSync(path.join(web, "src/app/page.tsx"), "utf8");
  // Hero button kept…
  assert.match(page, /Baixar o app/);
  // …the section comes right after the plans…
  assert.match(page, /<PricingSection plans=\{pricingPlans\} \/>\s*(\{\/\*[^*]*\*\/\}\s*)?<HomeDownloadSection \/>/);
  // …and the old footer badge is gone (one CTA, not two).
  const footer = page.slice(page.indexOf("<footer"), page.indexOf("</footer>"));
  assert.doesNotMatch(footer, /AppStore|APP_STORE/);
  assert.doesNotMatch(page, /<HomeAppStoreBadge/);

  const section = readFileSync(path.join(web, "src/app/home-download-section.tsx"), "utf8");
  assert.match(section, /Baixe o Moments Forever/);
  assert.match(section, /Leve suas memórias com você\./);
  assert.match(section, /data-reveal/);
  assert.match(section, /<HomeAppStoreBadge \/>/);

  const badge = readFileSync(path.join(web, "src/app/home-app-store-badge.tsx"), "utf8");
  assert.match(badge, /href=\{APP_STORE_URL\}/);
  assert.match(badge, /Baixar na/);
  assert.match(badge, /App Store/);
  assert.match(badge, /<path d="M12\.152 6\.896/, "Apple logo");

  const css = readFileSync(path.join(web, "src/app/home.module.css"), "utf8");
  // The section is shown inside the iOS app too (only the hero button is hidden there).
  assert.doesNotMatch(css, /:global\(html\[data-native-ios-app\]\) \.download\s*\{/);
  assert.doesNotMatch(css, /footerStore/);
  // Staged entrance in the requested order: eyebrow → title → text → button → phone → photos.
  const delayOf = (selector: string): number => {
    const rule = css.match(
      new RegExp(`\\.download:global\\(\\.is-visible\\) \\.${selector}\\s*\\{\\s*animation:([^;]*);`),
    )?.[1];
    assert.ok(rule, `${selector} has an entrance animation`);
    // The first animation of the list is the entrance: "<name> <duration> cubic-bezier(…) <delay> both".
    return Number(rule.match(/cubic-bezier\([^)]*\)\s+([\d.]+)s\s+both/)![1]);
  };
  const order = [
    "downloadEyebrow",
    "downloadTitle",
    "downloadLead",
    "downloadAction",
    "downloadPhone",
    "downloadPolaroidLeft",
  ].map(delayOf);
  assert.deepEqual([...order].sort((x, y) => x - y), order, "entrance delays are increasing");
  assert.ok(delayOf("downloadBody") < delayOf("downloadAction"), "text before the button");
  assert.ok(delayOf("downloadPolaroidRight") > delayOf("downloadPhone"), "photos after the phone");
  // Only the tiny float loops, and only on the phone and the two photos (alternating, slow).
  const infinite = css.match(/animation:[^;]*infinite[^;]*;/g) ?? [];
  assert.equal(infinite.length, 3);
  for (const rule of infinite) assert.match(rule, /downloadFloat\w+ [7-9]s|downloadFloat\w+ 10s/);
  assert.match(css, /downloadFloatPhone[\s\S]*?translate: 0 -7px/);
  // Reduced motion removes entrance and float.
  assert.match(
    css,
    /prefers-reduced-motion: reduce\)\s*\{\s*\.download \.downloadEyebrow[\s\S]*?\.download \.downloadPolaroid\s*\{\s*animation: none !important;/,
  );
});

/** sha256 of the capture exactly as it was sent (iPhone screenshot, 1290x2796). */
const APP_SCREEN_SHA256 = "b658af2ff3a42ac379850a176b8b9a87caf545e43b6d91e0c231ee485a5e6c8f";

test("the iPhone in the download section shows the real app capture, byte for byte", () => {
  const web = path.resolve(__dirname, "../../..");
  const png = readFileSync(path.join(web, "public/home/app-screen-mapa.png"));
  assert.equal(createHash("sha256").update(png).digest("hex"), APP_SCREEN_SHA256, "file is the supplied capture");
  assert.equal(png.readUInt32BE(16), 1290, "width");
  assert.equal(png.readUInt32BE(20), 2796, "height");

  const section = readFileSync(path.join(web, "src/app/home-download-section.tsx"), "utf8");
  assert.match(section, /src="\/home\/app-screen-mapa\.png"/);
  // No invented screen: the old generic trip content is gone.
  assert.doesNotMatch(section, /Santorini|santorini|9 fotos|Perfil<|downloadScreenCard/);

  const css = readFileSync(path.join(web, "src/app/home.module.css"), "utf8");
  const rule = css.match(/\.downloadScreenImage\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(rule, /filter/, "no filters on the capture");
  assert.match(rule, /object-fit: cover/);
  assert.doesNotMatch(css, /downloadScreenCard|downloadScreenKicker|downloadScreenTitle|downloadScreenMeta/);
});


#!/usr/bin/env node
/**
 * Android launcher icons and launch screen from the brand artwork (public/brand/logo.png), so the
 * app does not ship Capacitor's placeholder icon. Run from apps/web after `cap add android`:
 *   node scripts/generate-android-icons.mjs
 *
 * - mipmap-*\/ic_launcher.png and ic_launcher_round.png: legacy (pre Android 8) square / round icon.
 * - mipmap-*\/ic_launcher_foreground.png: adaptive icon layer. The artwork fills the 108dp canvas;
 *   launchers show only the centre 66%, which keeps the logo and its text intact.
 * - values/ic_launcher_background.xml: #121110 behind the adaptive icon (same dark as the app).
 * - drawable/splash.xml: dark launch background (Android < 12) with the icon centred; the old
 *   per-density splash.png placeholders are removed.
 *
 * Needs `sharp` (already installed through Next.js); it is not a dependency of this package.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "..", "public", "brand", "logo.png");
const RES = join(here, "..", "android", "app", "src", "main", "res");
const DARK = "#121110";

if (!existsSync(RES)) {
  console.error(`[android-icons] ${RES} not found. Run \`npx cap add android\` first.`);
  process.exit(1);
}

// density -> [launcher px (48dp), adaptive layer px (108dp)]
const DENSITIES = {
  mdpi: [48, 108],
  hdpi: [72, 162],
  xhdpi: [96, 216],
  xxhdpi: [144, 324],
  xxxhdpi: [192, 432],
};

const circle = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

for (const [density, [launcher, layer]] of Object.entries(DENSITIES)) {
  const dir = join(RES, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  const square = await sharp(SOURCE).resize(launcher, launcher).png().toBuffer();
  writeFileSync(join(dir, "ic_launcher.png"), square);
  const round = await sharp(square).composite([{ input: circle(launcher), blend: "dest-in" }]).png().toBuffer();
  writeFileSync(join(dir, "ic_launcher_round.png"), round);
  writeFileSync(join(dir, "ic_launcher_foreground.png"), await sharp(SOURCE).resize(layer, layer).png().toBuffer());
}

writeFileSync(
  join(RES, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${DARK}</color>\n</resources>\n`,
);

// Launch screen: dark background, icon centred. Replaces Capacitor's white placeholder splash.png files.
for (const entry of readdirSync(RES)) {
  if (/^drawable(-(land|port)-[a-z]+dpi)?$/.test(entry)) {
    const file = join(RES, entry, "splash.png");
    if (existsSync(file)) rmSync(file);
  }
}
writeFileSync(
  join(RES, "drawable", "splash.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n    <item android:drawable="@color/ic_launcher_background" />\n    <item>\n        <bitmap android:gravity="center" android:src="@mipmap/ic_launcher" />\n    </item>\n</layer-list>\n`,
);
console.log("[android-icons] launcher icons, adaptive layers, background colour and splash.xml written.");

/**
 * Builds the map label fonts (glyph PBF ranges, SDF) that MapLibre needs to
 * draw any text, so the globe's labels are served from our own domain instead
 * of a third-party font server:
 *
 *   public/fonts/NotoSans-Regular/0-255.pbf
 *   public/fonts/NotoSans-SemiBold/0-255.pbf
 *
 * Latin-1 covers every label: names are Portuguese, and the few city spellings
 * with rarer letters are folded to Latin-1 by build-globe-geo.mjs. Noto Sans is SIL OFL 1.1 — see
 * public/fonts/LICENSE-NotoSans.txt.
 *
 * Regenerate (not app dependencies, so nothing touches package.json):
 *   mkdir /tmp/geo && cd /tmp/geo && npm init -y && npm i fontnik @expo-google-fonts/noto-sans
 *   GEO_DEPS_DIR=/tmp/geo node apps/web/scripts/build-globe-fonts.mjs
 */
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "../public/fonts");
const depsDir = process.env.GEO_DEPS_DIR ?? process.cwd();
const require = createRequire(path.join(depsDir, "package.json"));
const fontnik = require("fontnik");

const FONTS = [
  ["NotoSans-Regular", "@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf"],
  ["NotoSans-SemiBold", "@expo-google-fonts/noto-sans/600SemiBold/NotoSans_600SemiBold.ttf"],
];
const RANGES = [[0, 255]];

const range = (options) =>
  new Promise((resolve, reject) =>
    fontnik.range(options, (error, data) => (error ? reject(error) : resolve(data))),
  );

for (const [stack, specifier] of FONTS) {
  const font = readFileSync(require.resolve(specifier));
  mkdirSync(path.join(OUT_DIR, stack), { recursive: true });
  for (const [start, end] of RANGES) {
    const data = await range({ font, start, end });
    writeFileSync(path.join(OUT_DIR, stack, `${start}-${end}.pbf`), data);
    console.log(stack, `${start}-${end}`, data.length, "bytes");
  }
}
copyFileSync(
  require.resolve("@expo-google-fonts/noto-sans/LICENSE_FONT"),
  path.join(OUT_DIR, "LICENSE-NotoSans.txt"),
);

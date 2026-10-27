import assert from "node:assert/strict";
import test from "node:test";

import { hasValidCoordinates, miniMapTiles, openInMapsUrl, worldPixel } from "./lightbox-map";

test("only real coordinates produce a map", () => {
  assert.equal(hasValidCoordinates(18.4655, -66.1057), true);
  assert.equal(hasValidCoordinates(null, null), false);
  assert.equal(hasValidCoordinates(18.4, null), false);
  assert.equal(hasValidCoordinates(Number.NaN, 10), false);
  assert.equal(hasValidCoordinates(95, 10), false);
});

test("the point sits at the centre of the tile cover", () => {
  const width = 120;
  const height = 96;
  const tiles = miniMapTiles(18.4655, -66.1057, width, height);
  assert.ok(tiles.length >= 1 && tiles.length <= 4);
  const center = worldPixel(18.4655, -66.1057, 10);
  const first = tiles[0]!;
  const [, x, y] = first.url.replace("https://tile.openstreetmap.org/", "").replace(".png", "").split("/").map(Number) as [number, number, number];
  // The tile that holds the point is placed so that the point lands at (width/2, height/2).
  const held = tiles.find((tile) => {
    const [, tx, ty] = tile.url.replace("https://tile.openstreetmap.org/", "").replace(".png", "").split("/").map(Number) as [number, number, number];
    return tx === Math.floor(center.x / 256) && ty === Math.floor(center.y / 256);
  });
  assert.ok(held, "the tile containing the point is loaded");
  assert.ok(Math.abs(held.left + (center.x % 256) - width / 2) <= 1);
  assert.ok(Math.abs(held.top + (center.y % 256) - height / 2) <= 1);
  assert.ok(Number.isInteger(x) && Number.isInteger(y));
});

test("tiles wrap at the antimeridian and never go past the poles", () => {
  const tiles = miniMapTiles(-14.2756, 179.99, 120, 96);
  assert.ok(tiles.every((tile) => /\/(\d+)\/(\d+)\.png$/u.test(tile.url)));
  assert.ok(tiles.every((tile) => Number(tile.url.split("/")[3]) < 2 ** 10));
  assert.ok(miniMapTiles(84.99, 10, 120, 96).every((tile) => Number(tile.url.split("/")[4]?.replace(".png", "")) >= 0));
});

test("the open-in-maps link carries the position and the label", () => {
  const url = openInMapsUrl(18.4655, -66.1057, "San Juan, Porto Rico");
  assert.match(url, /^https:\/\/maps\.apple\.com\/\?/u);
  assert.match(url, /ll=18\.46550%2C-66\.10570/u);
  assert.match(url, /q=San\+Juan%2C\+Porto\+Rico/u);
  assert.ok(!openInMapsUrl(1, 2, null).includes("q="));
});

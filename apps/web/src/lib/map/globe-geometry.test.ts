import assert from "node:assert/strict";
import test from "node:test";

import { globeEffectOpacity, globeScreenRadius } from "./globe-geometry";

// Silhouette radii measured on a real maplibre-gl globe centred at latitude 18°
// (viewport height → zoom → px).
const MEASURED: ReadonlyArray<readonly [number, number, number]> = [
  [700, 0.6, 116],
  [700, 1, 149],
  [700, 1.35, 183],
  [800, 0.6, 118],
  [800, 1, 151],
  [800, 1.35, 187],
  [800, 2, 273],
];

test("globe radius matches what MapLibre actually draws", () => {
  for (const [height, zoom, expected] of MEASURED) {
    const radius = globeScreenRadius(zoom, height, 18);
    assert.ok(
      Math.abs(radius - expected) <= 2.5,
      `h=${height} z=${zoom}: got ${radius.toFixed(1)}, measured ${expected}`,
    );
  }
});

test("the globe is bigger when centred away from the equator", () => {
  assert.ok(globeScreenRadius(1.5, 700, 50) > globeScreenRadius(1.5, 700, 0));
  assert.equal(globeScreenRadius(1.5, 700, 50), globeScreenRadius(1.5, 700, -50));
});

test("globe radius grows with zoom and is safe on bad input", () => {
  assert.ok(globeScreenRadius(2, 700) > globeScreenRadius(1, 700));
  assert.equal(globeScreenRadius(Number.NaN, 700), 0);
  assert.equal(globeScreenRadius(1, 0), 0);
});

test("the lighting fades out before the globe flattens into the map", () => {
  assert.equal(globeEffectOpacity(1.35), 1);
  assert.equal(globeEffectOpacity(3.6), 1);
  assert.ok(globeEffectOpacity(4.2) > 0 && globeEffectOpacity(4.2) < 1);
  assert.equal(globeEffectOpacity(4.8), 0);
  assert.equal(globeEffectOpacity(10), 0);
});

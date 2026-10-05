import assert from "node:assert/strict";
import test from "node:test";

import {
  PARALLAX_DEPTH,
  easeToward,
  globeSurfaceShift,
  softClamp,
  wrapLongitudeDelta,
  wrapOffset,
} from "./globe-parallax";

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);

test("depth: nearer layers follow more, and all stay a small share of the globe", () => {
  assert.ok(PARALLAX_DEPTH.near >= 0.15 && PARALLAX_DEPTH.near <= 0.2);
  assert.ok(PARALLAX_DEPTH.far >= 0.05 && PARALLAX_DEPTH.far <= 0.1);
  assert.ok(PARALLAX_DEPTH.nebula >= 0.02 && PARALLAX_DEPTH.nebula <= 0.05);
  assert.ok(PARALLAX_DEPTH.near > PARALLAX_DEPTH.mid);
  assert.ok(PARALLAX_DEPTH.mid > PARALLAX_DEPTH.far);
  assert.ok(PARALLAX_DEPTH.far > PARALLAX_DEPTH.nebula);
});

test("longitude differences take the short way round the antimeridian", () => {
  close(wrapLongitudeDelta(10), 10);
  close(wrapLongitudeDelta(-10), -10);
  close(wrapLongitudeDelta(179 - -179), -2);
  close(wrapLongitudeDelta(-179 - 179), 2);
  close(wrapLongitudeDelta(360), 0);
});

test("the globe slides against the camera, at the Mercator scale of the centre", () => {
  const zoom = 2;
  const pxPerDegree = (512 * 2 ** zoom) / 360;

  // Camera heads east (longitude grows): the surface slides left.
  const east = globeSurfaceShift({ lng: 0, lat: 0 }, { lng: 10, lat: 0 }, zoom);
  close(east.dx, -10 * pxPerDegree, 1e-3);
  close(east.dy, 0);

  // Camera heads north: the surface slides down.
  const north = globeSurfaceShift({ lng: 0, lat: 0 }, { lng: 0, lat: 5 }, zoom);
  close(north.dx, 0);
  close(north.dy, (5 * pxPerDegree) / Math.cos((2.5 * Math.PI) / 180), 1e-3);

  // Away from the equator a degree of latitude covers more screen (1 / cos).
  const high = globeSurfaceShift({ lng: 0, lat: 59 }, { lng: 0, lat: 61 }, zoom);
  close(high.dy, (2 * pxPerDegree) / Math.cos((60 * Math.PI) / 180), 0.05);
});

test("zooming in makes the same angular move cover more screen", () => {
  const near = globeSurfaceShift({ lng: 0, lat: 0 }, { lng: 1, lat: 0 }, 4);
  const far = globeSurfaceShift({ lng: 0, lat: 0 }, { lng: 1, lat: 0 }, 1);
  assert.ok(Math.abs(near.dx) > Math.abs(far.dx) * 7);
});

test("crossing the antimeridian is a small step, not a jump around the world", () => {
  const shift = globeSurfaceShift({ lng: 179.5, lat: 0 }, { lng: -179.5, lat: 0 }, 2);
  assert.ok(Math.abs(shift.dx) < 20, `dx=${shift.dx}`);
});

test("bad input never produces NaN", () => {
  const shift = globeSurfaceShift({ lng: Number.NaN, lat: 0 }, { lng: 1, lat: 0 }, 2);
  assert.deepEqual(shift, { dx: 0, dy: 0 });
});

test("tiled layers wrap into one tile so they never run out of sky", () => {
  close(wrapOffset(0, 480), 0);
  close(wrapOffset(500, 480), 20);
  close(wrapOffset(-20, 480), 460);
  close(wrapOffset(-480 * 3 - 1, 480), 479);
  assert.equal(wrapOffset(10, 0), 0);
});

test("the nebula offset is smooth and bounded", () => {
  close(softClamp(0, 30), 0);
  assert.ok(softClamp(1, 30) > 0.99 && softClamp(1, 30) < 1.01, "≈ linear near zero");
  assert.ok(softClamp(1e6, 30) <= 30);
  assert.ok(softClamp(-1e6, 30) >= -30);
  assert.ok(softClamp(100, 30) < softClamp(200, 30));
  assert.equal(softClamp(5, 0), 0);
});

test("easing covers half the gap per half-life, whatever the frame rate", () => {
  close(easeToward(0, 100, 110, 110), 50);
  // Two 55 ms frames land where one 110 ms frame does.
  const twoFrames = easeToward(easeToward(0, 100, 55, 110), 100, 55, 110);
  close(twoFrames, 50, 1e-6);
  // No time, or no smoothing configured: no change (never NaN).
  assert.equal(easeToward(3, 100, 0, 110), 3);
  assert.equal(easeToward(3, 100, 16, 0), 3);
  // It settles on the target.
  assert.ok(Math.abs(easeToward(0, 100, 2000, 110) - 100) < 0.001);
});

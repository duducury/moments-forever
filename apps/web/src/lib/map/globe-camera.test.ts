import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GLOBE_CAMERA,
  DEFAULT_VIEW_REACH_DEGREES,
  INTRO,
  angularDistanceDegrees,
  hasPlaceNearDefaultView,
  introEasing,
  introStart,
  zoomToFitGlobe,
} from "./globe-camera";
import { globeScreenRadius } from "./globe-geometry";

const place = (latitude: number, longitude: number) => ({ latitude, longitude });

test("great-circle distance in degrees", () => {
  assert.equal(Math.round(angularDistanceDegrees({ lng: 0, lat: 0 }, { lng: 0, lat: 0 })), 0);
  assert.equal(Math.round(angularDistanceDegrees({ lng: 0, lat: 0 }, { lng: 90, lat: 0 })), 90);
  assert.equal(Math.round(angularDistanceDegrees({ lng: 0, lat: 0 }, { lng: 180, lat: 0 })), 180);
  assert.equal(Math.round(angularDistanceDegrees({ lng: 10, lat: 90 }, { lng: -170, lat: 90 })), 0, "the pole is one point");
  // Short way across the antimeridian.
  assert.equal(Math.round(angularDistanceDegrees({ lng: 179, lat: 0 }, { lng: -179, lat: 0 })), 2);
});

test("the default view sits between Brazil and the USA", () => {
  const [lng, lat] = DEFAULT_GLOBE_CAMERA.center;
  assert.ok(lng < -45 && lng > -90, "Americas longitude");
  assert.ok(lat > 0 && lat < 30, "between South and North America");
  assert.ok(DEFAULT_VIEW_REACH_DEGREES > 40 && DEFAULT_VIEW_REACH_DEGREES < 65);
});

test("the zoom shows the whole globe, on a phone, an iPad and a desktop window", () => {
  for (const [width, height] of [[390, 640], [390, 700], [430, 760], [820, 1000], [1280, 700], [1280, 900]] as const) {
    const zoom = zoomToFitGlobe(width, height, 12);
    const diameter = 2 * globeScreenRadius(zoom, height, 12);
    assert.ok(diameter <= Math.min(width, height) * 0.92, `${width}x${height}: ${diameter.toFixed(0)}px does not fit`);
    // (Very large windows stop at the maximum zoom instead of growing the globe further.)
    if (zoom < 2.39) assert.ok(diameter >= Math.min(width, height) * 0.8, `${width}x${height}: ${diameter.toFixed(0)}px is needlessly small`);
    assert.ok(zoom >= 0.9 && zoom <= 2.4);
  }
  // Pulled back further than the previous default (2.2) on a phone.
  assert.ok(zoomToFitGlobe(390, 640, 12) < 1.6);
  // Unknown size falls back to a sensible whole-globe zoom.
  assert.equal(zoomToFitGlobe(0, 0, 12), DEFAULT_GLOBE_CAMERA.zoom);
});

test("the arrival animation starts further back and turned, and eases out", () => {
  const rest = { center: [-63, 12] as [number, number], zoom: 1.3 };
  const start = introStart(rest);
  assert.ok(start.zoom < rest.zoom);
  assert.ok(start.zoom >= 0.6);
  assert.equal(start.center[1], rest.center[1]);
  assert.equal(Math.round(start.center[0] - rest.center[0]), INTRO.turnDegrees);
  // Longitude wraps instead of leaving the ±180 range.
  assert.ok(introStart({ center: [170, 0], zoom: 1.3 }).center[0] <= 180);
  assert.ok(introStart({ center: [170, 0], zoom: 1.3 }).center[0] >= -180);
  // A small animation: about two seconds, quick at first, settling gently.
  assert.ok(INTRO.durationMs >= 1000 && INTRO.durationMs <= 2500);
  assert.equal(introEasing(0), 0);
  assert.equal(introEasing(1), 1);
  assert.ok(introEasing(0.5) > 0.5);
  assert.ok(introEasing(0.9) < 1);
});

test("places in Brazil and the USA keep the default camera", () => {
  assert.ok(hasPlaceNearDefaultView([place(-23.55, -46.63)]), "São Paulo");
  assert.ok(hasPlaceNearDefaultView([place(40.71, -74.0)]), "New York");
  assert.ok(hasPlaceNearDefaultView([place(25.76, -80.19)]), "Miami");
  assert.ok(hasPlaceNearDefaultView([place(-3.73, -38.52), place(35.68, 139.69)]), "one place in view is enough");
  assert.equal(hasPlaceNearDefaultView([place(48.85, 2.35)]), false, "Paris is out of reach");
  assert.ok(hasPlaceNearDefaultView([place(34.05, -118.2)]), "Los Angeles");
});

test("a profile with nothing near the Americas gets framed around its pins", () => {
  assert.equal(hasPlaceNearDefaultView([place(35.68, 139.69), place(-33.87, 151.2)]), false);
  assert.equal(hasPlaceNearDefaultView([]), false);
});

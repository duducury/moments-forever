import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GLOBE_CAMERA,
  DEFAULT_VIEW_REACH_DEGREES,
  FALLBACK_MAX_ZOOM,
  angularDistanceDegrees,
  hasPlaceNearDefaultView,
} from "./globe-camera";

const place = (latitude: number, longitude: number) => ({ latitude, longitude });

test("great-circle distance in degrees", () => {
  assert.equal(Math.round(angularDistanceDegrees({ lng: 0, lat: 0 }, { lng: 0, lat: 0 })), 0);
  assert.equal(Math.round(angularDistanceDegrees({ lng: 0, lat: 0 }, { lng: 90, lat: 0 })), 90);
  assert.equal(Math.round(angularDistanceDegrees({ lng: 0, lat: 0 }, { lng: 180, lat: 0 })), 180);
  assert.equal(Math.round(angularDistanceDegrees({ lng: 10, lat: 90 }, { lng: -170, lat: 90 })), 0, "the pole is one point");
  // Short way across the antimeridian.
  assert.equal(Math.round(angularDistanceDegrees({ lng: 179, lat: 0 }, { lng: -179, lat: 0 })), 2);
});

test("the default view sits between Brazil and the USA and is a bit pulled back", () => {
  const [lng, lat] = DEFAULT_GLOBE_CAMERA.center;
  assert.ok(lng < -45 && lng > -90, "Americas longitude");
  assert.ok(lat > 0 && lat < 30, "between South and North America");
  // Wider than the old framing (up to 3.8), but still a close-ish look at the continent.
  assert.ok(DEFAULT_GLOBE_CAMERA.zoom >= 1.8 && DEFAULT_GLOBE_CAMERA.zoom <= 2.6);
  assert.ok(FALLBACK_MAX_ZOOM < 3.8);
  assert.ok(DEFAULT_VIEW_REACH_DEGREES > 40 && DEFAULT_VIEW_REACH_DEGREES < 65);
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

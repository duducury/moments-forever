import assert from "node:assert/strict";
import test from "node:test";

import { IOS_STARTUP_IMAGES } from "./ios-startup-images";

test("iOS startup images cover portrait iPhone sizes without duplicates", () => {
  assert.ok(IOS_STARTUP_IMAGES.length >= 10);

  const keys = IOS_STARTUP_IMAGES.map(
    (image) => `${image.width}x${image.height}@${image.pixelRatio}`,
  );
  assert.equal(new Set(keys).size, keys.length);

  for (const image of IOS_STARTUP_IMAGES) {
    assert.equal(image.width, image.deviceWidth * image.pixelRatio);
    assert.equal(image.height, image.deviceHeight * image.pixelRatio);
    assert.equal(
      image.src,
      `/brand/splash/${image.width}x${image.height}.png`,
    );
    assert.match(image.media, /orientation: portrait/);
    assert.match(image.media, new RegExp(`device-width: ${image.deviceWidth}px`));
  }

  assert.ok(
    IOS_STARTUP_IMAGES.some(
      (image) => image.width === 1260 && image.height === 2736,
    ),
    "iPhone Air 420x912@3",
  );
  assert.ok(
    IOS_STARTUP_IMAGES.some(
      (image) => image.width === 1080 && image.height === 2340,
    ),
    "iPhone mini 360x780@3",
  );
});

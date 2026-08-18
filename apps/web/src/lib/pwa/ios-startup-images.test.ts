import assert from "node:assert/strict";
import test from "node:test";

import { IOS_STARTUP_IMAGES } from "./ios-startup-images";

test("iOS startup images cover portrait and landscape iPhone sizes", () => {
  assert.ok(IOS_STARTUP_IMAGES.length >= 20);

  const keys = IOS_STARTUP_IMAGES.map(
    (image) =>
      `${image.width}x${image.height}@${image.pixelRatio}:${image.orientation}`,
  );
  assert.equal(new Set(keys).size, keys.length);

  for (const image of IOS_STARTUP_IMAGES) {
    assert.equal(image.width, image.deviceWidth * image.pixelRatio);
    assert.equal(image.height, image.deviceHeight * image.pixelRatio);
    assert.equal(
      image.src,
      `/brand/splash/${image.width}x${image.height}.png`,
    );
    assert.match(image.media, new RegExp(`orientation: ${image.orientation}`));
    assert.match(image.media, new RegExp(`device-width: ${image.deviceWidth}px`));
  }

  assert.ok(
    IOS_STARTUP_IMAGES.some(
      (image) =>
        image.width === 1260 &&
        image.height === 2736 &&
        image.orientation === "portrait",
    ),
    "iPhone Air portrait",
  );
  assert.ok(
    IOS_STARTUP_IMAGES.some(
      (image) =>
        image.width === 2736 &&
        image.height === 1260 &&
        image.orientation === "landscape",
    ),
    "iPhone Air landscape",
  );
});

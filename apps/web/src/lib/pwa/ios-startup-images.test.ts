import assert from "node:assert/strict";
import test from "node:test";

import { IOS_STARTUP_IMAGES, iosStartupImageMedia } from "./ios-startup-images";

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
    assert.match(image.media, /^screen and /);
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

test("iosStartupImageMedia includes screen, dark, and light queries", () => {
  const image = IOS_STARTUP_IMAGES[0];
  if (!image) throw new Error("missing startup image");
  const media = iosStartupImageMedia(image);
  assert.equal(media.length, 3);
  assert.equal(media[0], image.media);
  assert.match(media[1] ?? "", /prefers-color-scheme: dark/);
  assert.match(media[2] ?? "", /prefers-color-scheme: light/);
});


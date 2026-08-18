/**
 * iPhone “Add to Home Screen” splash screens.
 * iOS ignores apple-touch-startup-image unless width/height match the device
 * exactly; a mismatch falls back to a blank white launch.
 */
export type IosStartupImage = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly deviceWidth: number;
  readonly deviceHeight: number;
  readonly pixelRatio: number;
  readonly media: string;
};

function splashMedia(
  deviceWidth: number,
  deviceHeight: number,
  pixelRatio: number,
): string {
  return `(device-width: ${deviceWidth}px) and (device-height: ${deviceHeight}px) and (-webkit-device-pixel-ratio: ${pixelRatio}) and (orientation: portrait)`;
}

function splash(
  width: number,
  height: number,
  deviceWidth: number,
  deviceHeight: number,
  pixelRatio: number,
): IosStartupImage {
  return {
    src: `/brand/splash/${width}x${height}.png`,
    width,
    height,
    deviceWidth,
    deviceHeight,
    pixelRatio,
    media: splashMedia(deviceWidth, deviceHeight, pixelRatio),
  };
}

/** Portrait launches for current iPhone sizes (SE through 16 Pro Max). */
export const IOS_STARTUP_IMAGES: readonly IosStartupImage[] = [
  splash(1320, 2868, 440, 956, 3),
  splash(1206, 2622, 402, 874, 3),
  splash(1290, 2796, 430, 932, 3),
  splash(1179, 2556, 393, 852, 3),
  splash(1284, 2778, 428, 926, 3),
  splash(1170, 2532, 390, 844, 3),
  splash(1242, 2688, 414, 896, 3),
  splash(828, 1792, 414, 896, 2),
  splash(1125, 2436, 375, 812, 3),
  splash(1242, 2208, 414, 736, 3),
  splash(750, 1334, 375, 667, 2),
  splash(640, 1136, 320, 568, 2),
];

/** Matches the default (dark) theme and web manifest background_color. */
export const IOS_SPLASH_BACKGROUND = "#121110";

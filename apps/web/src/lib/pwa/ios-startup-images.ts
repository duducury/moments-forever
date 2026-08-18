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
  readonly orientation: "portrait" | "landscape";
  readonly media: string;
};

function splashMedia(
  deviceWidth: number,
  deviceHeight: number,
  pixelRatio: number,
  orientation: "portrait" | "landscape",
): string {
  return `screen and (device-width: ${deviceWidth}px) and (device-height: ${deviceHeight}px) and (-webkit-device-pixel-ratio: ${pixelRatio}) and (orientation: ${orientation})`;
}

function splash(
  width: number,
  height: number,
  deviceWidth: number,
  deviceHeight: number,
  pixelRatio: number,
  orientation: "portrait" | "landscape",
): IosStartupImage {
  return {
    src: `/brand/splash/${width}x${height}.png`,
    width,
    height,
    deviceWidth,
    deviceHeight,
    pixelRatio,
    orientation,
    media: splashMedia(deviceWidth, deviceHeight, pixelRatio, orientation),
  };
}

function pair(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): readonly IosStartupImage[] {
  const width = cssWidth * pixelRatio;
  const height = cssHeight * pixelRatio;
  return [
    splash(width, height, cssWidth, cssHeight, pixelRatio, "portrait"),
    splash(height, width, cssHeight, cssWidth, pixelRatio, "landscape"),
  ];
}

/** Portrait + landscape for SE through iPhone 17 / Air. */
export const IOS_STARTUP_IMAGES: readonly IosStartupImage[] = [
  ...pair(440, 956, 3),
  ...pair(420, 912, 3),
  ...pair(402, 874, 3),
  ...pair(430, 932, 3),
  ...pair(393, 852, 3),
  ...pair(428, 926, 3),
  ...pair(390, 844, 3),
  ...pair(414, 896, 3),
  ...pair(360, 780, 3),
  ...pair(414, 896, 2),
  ...pair(375, 812, 3),
  ...pair(414, 736, 3),
  ...pair(375, 667, 2),
  ...pair(320, 568, 2),
];

/** Matches the default (dark) theme and web manifest background_color. */
export const IOS_SPLASH_BACKGROUND = "#121110";

/** Extra queries so light/dark iOS appearance still picks a startup image. */
export function iosStartupImageMedia(image: IosStartupImage): readonly string[] {
  const core = image.media.replace(/^screen and /u, "");
  return [
    image.media,
    `screen and (prefers-color-scheme: dark) and ${core}`,
    `screen and (prefers-color-scheme: light) and ${core}`,
  ];
}

/** Public App Store page of the app (the "Baixar o app" button on the home page). */
export const APP_STORE_URL = "https://apps.apple.com/us/app/moments-forever/id6817206704";

/** Attribute put on <html> while the page runs inside the iOS app. */
export const NATIVE_IOS_APP_ATTRIBUTE = "data-native-ios-app";

/**
 * Inline <head> script, run before first paint: marks <html> when the page runs
 * inside the iOS app (Capacitor injects window.Capacitor before the page
 * scripts). CSS then hides things that only make sense on the web — the
 * "download the app" button — without a flash and without server-side guessing.
 * Never throws.
 */
export function nativeIosAppMarkerScript(): string {
  const attribute = JSON.stringify(NATIVE_IOS_APP_ATTRIBUTE);
  return `(()=>{try{var c=window.Capacitor;if(c&&typeof c.isNativePlatform==="function"&&c.isNativePlatform()&&typeof c.getPlatform==="function"&&c.getPlatform()==="ios")document.documentElement.setAttribute(${attribute},"1")}catch(_){}})();`;
}

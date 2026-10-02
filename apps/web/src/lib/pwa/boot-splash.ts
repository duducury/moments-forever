/**
 * The cold-start splash (#pwa-boot-splash) should appear once, not again on
 * every document load of the same visit. Opening an NFC link, for example,
 * loads two documents back to back (/n/<token>, then the album it redirects
 * to) and used to show the splash twice with a blank gap in between.
 *
 * The first document stamps sessionStorage; any document loaded within
 * BOOT_SPLASH_SKIP_WINDOW_MS of that stamp skips the splash and goes
 * straight to the route's own loading skeleton.
 */
export const BOOT_SPLASH_STORAGE_KEY = "mf-boot-splash-at";
export const BOOT_SPLASH_SKIP_WINDOW_MS = 20_000;

export function shouldSkipBootSplash(
  stamp: string | null | undefined,
  now: number,
  windowMs: number = BOOT_SPLASH_SKIP_WINDOW_MS,
): boolean {
  if (!stamp) return false;
  const stampedAt = Number(stamp);
  if (!Number.isFinite(stampedAt)) return false;
  const age = now - stampedAt;
  return age >= 0 && age < windowMs;
}

/**
 * Inline <head> script. Runs before first paint: marks <html> so CSS can hide
 * the splash, and starts the window if this is the first document of the
 * visit. Must stay in sync with shouldSkipBootSplash (see the test).
 */
export function bootSplashSkipScript(): string {
  const key = JSON.stringify(BOOT_SPLASH_STORAGE_KEY);
  return `(()=>{try{var k=${key},s=sessionStorage,v=s.getItem(k),n=Date.now(),a=n-Number(v);if(v&&isFinite(a)&&a>=0&&a<${BOOT_SPLASH_SKIP_WINDOW_MS}){document.documentElement.dataset.bootSplash="skip"}else{s.setItem(k,String(n))}}catch(_){}})();`;
}

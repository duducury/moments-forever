/**
 * Public contract of the MomentsNativeAuth Capacitor plugin (iOS only).
 *
 * `start` opens the provider's login page in the system's
 * ASWebAuthenticationSession sheet and resolves with the URL the sheet was
 * redirected to (always on the app's own callback scheme). Rejects with code
 * `CANCELLED` when the person closes the sheet.
 */
export interface NativeAuthStartOptions {
  /** The https authorize URL (from Supabase `signInWithOAuth`, `skipBrowserRedirect: true`). */
  readonly url: string;
}

export interface NativeAuthStartResult {
  /** The full callback URL, e.g. `com.momentsforever.app://auth/callback?code=…`. */
  readonly url: string;
}

export interface MomentsNativeAuthPlugin {
  start(options: NativeAuthStartOptions): Promise<NativeAuthStartResult>;
}

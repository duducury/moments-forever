"use client";

import { useSyncExternalStore } from "react";

import { isNativeIosApp } from "@/lib/auth/apple-sign-in";

export type OAuthProvider = "apple" | "google" | "facebook";

interface OAuthButtonsProps {
  readonly busy: boolean;
  readonly onSelect: (provider: OAuthProvider) => void;
}

const subscribeNever = () => () => {};

/** Server and first client render say "no" (so hydration matches); inside the iOS shell it flips to true. */
function useIsNativeIosApp(): boolean {
  return useSyncExternalStore(subscribeNever, () => isNativeIosApp(), () => false);
}

/**
 * Sign in with Apple is native-only: it runs through Apple's own sheet inside
 * the iOS app (see lib/auth/apple-sign-in.ts) and is not offered in a regular
 * browser, where this app has no web redirect flow for it.
 */
export function OAuthButtons({ busy, onSelect }: OAuthButtonsProps) {
  const showApple = useIsNativeIosApp();
  return (
    <div className="oauth-actions">
      {showApple ? (
        <button
          className="button oauth-apple"
          disabled={busy}
          onClick={() => onSelect("apple")}
          type="button"
        >
          <AppleIcon />
          Continuar com a Apple
        </button>
      ) : null}
      <button
        className="button oauth-google"
        disabled={busy}
        onClick={() => onSelect("google")}
        type="button"
      >
        <GoogleIcon />
        Continuar com Google
      </button>
      <button
        className="button oauth-facebook"
        disabled={busy}
        onClick={() => onSelect("facebook")}
        type="button"
      >
        <FacebookIcon />
        Continuar com Facebook
      </button>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="oauth-icon"
      fill="currentColor"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="oauth-icon"
      height="20"
      viewBox="0 0 48 48"
      width="20"
    >
      <path
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        fill="#EA4335"
      />
      <path
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.02l7.73 6c4.51-4.18 7.09-10.36 7.09-17.49z"
        fill="#4285F4"
      />
      <path
        d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A24 24 0 0 0 0 24c0 3.86.92 7.51 2.56 10.78l7.97-6.19z"
        fill="#FBBC05"
      />
      <path
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"
        fill="#34A853"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg
      aria-hidden="true"
      className="oauth-icon"
      fill="currentColor"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

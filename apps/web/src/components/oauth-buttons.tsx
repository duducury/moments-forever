interface OAuthButtonsProps {
  readonly busy: boolean;
  readonly onSelect: (provider: "google" | "facebook") => void;
}

/** Apple exige conta paga de desenvolvedor — oculto até ser ativado. */
export function OAuthButtons({ busy, onSelect }: OAuthButtonsProps) {
  return (
    <div className="oauth-actions">
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

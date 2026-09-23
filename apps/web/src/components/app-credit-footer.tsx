import Link from "next/link";

export function AppCreditFooter({
  homeLinkHref,
}: {
  /** Shown only for a visitor without an account browsing someone else's profile — a quiet way back to sign up, not a call to action. */
  readonly homeLinkHref?: string;
} = {}) {
  return (
    <p className="app-credit">
      © {new Date().getFullYear()} Moments Forever. Criado por Eduardo Cury.
      {homeLinkHref ? (
        <>
          {" · "}
          <Link href={homeLinkHref}>Criar minha conta</Link>
        </>
      ) : null}
    </p>
  );
}

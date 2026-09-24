import Link from "next/link";

export function AppCreditFooter({
  homeLinkHref,
  inicioLinkHref,
}: {
  /** Shown only for a visitor without an account browsing someone else's profile — a quiet way back to sign up, not a call to action. */
  readonly homeLinkHref?: string;
  /** Shown only when user is logged in viewing their profile — link to home page. */
  readonly inicioLinkHref?: string;
} = {}) {
  return (
    <p className="app-credit">
      © {new Date().getFullYear()} Moments Forever. Criado por Eduardo Cury.
      {inicioLinkHref ? (
        <>
          {" · "}
          <Link href={inicioLinkHref}>Início</Link>
        </>
      ) : null}
      {homeLinkHref ? (
        <>
          {" · "}
          <Link href={homeLinkHref}>Criar minha conta</Link>
        </>
      ) : null}
    </p>
  );
}

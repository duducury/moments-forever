"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "./auth-provider";
import { CopyPageLinkButton } from "./copy-page-link-button";
import { ThemeSelector } from "./theme-selector";

export function AuthStatus({
  hideUserName = false,
}: {
  /**
   * Own profile home: account name is not shown in the top bar (hero already
   * has it). Sair / Privacidade live under /geral.
   */
  readonly hideUserName?: boolean;
}) {
  const pathname = usePathname();
  const { loading, user } = useAuth();
  const onSettingsSurface =
    pathname.startsWith("/geral") || pathname.startsWith("/privacidade");

  // Name was removed from the top bar entirely; prop kept for call-site clarity.
  void hideUserName;

  if (loading) {
    return (
      <div className="auth-actions">
        <CopyPageLinkButton />
        {!onSettingsSurface ? <ThemeSelector /> : null}
        <span className="text-link">Carregando…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-actions">
        <CopyPageLinkButton />
        <ThemeSelector />
        <Link className="text-link" href="/login">
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-actions">
      <CopyPageLinkButton />
      {/* Desktop only — mobile uses the Geral tab in the bottom bar. */}
      {!onSettingsSurface ? (
        <Link
          className="text-link hide-when-bottom-nav"
          href="/geral"
          title="Geral"
        >
          Geral
        </Link>
      ) : null}
      {!onSettingsSurface ? <ThemeSelector /> : null}
    </div>
  );
}

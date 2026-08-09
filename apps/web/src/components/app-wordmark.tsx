"use client";

import Link from "next/link";

import { useAuth } from "./auth-provider";
import { useProfileHomeHref } from "./profile-home";

/**
 * Logo / wordmark home target:
 * - inside a public profile context → that profile (/{nome})
 * - logged in → /perfil (redirects to own /{slug})
 * - visitor elsewhere → institutional landing (/)
 */
export function AppWordmark({
  className = "wordmark",
}: {
  readonly className?: string;
}) {
  const { user, loading } = useAuth();
  const profileHome = useProfileHomeHref();
  const href =
    profileHome ?? (!loading && user ? "/perfil" : "/");

  return (
    <Link className={className} href={href}>
      Moments Forever
    </Link>
  );
}

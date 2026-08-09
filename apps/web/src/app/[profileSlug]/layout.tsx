import type { ReactNode } from "react";

import { ProfileHomeProvider } from "@/components/profile-home";
import {
  isReservedProfileSlug,
  publicProfilePath,
} from "@/lib/profile/profile-slug";

export default async function PublicProfileLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly profileSlug: string }>;
}) {
  const { profileSlug: raw } = await params;
  const profileSlug = decodeURIComponent(raw).trim().toLowerCase();

  if (!profileSlug || isReservedProfileSlug(profileSlug)) {
    return children;
  }

  return (
    <ProfileHomeProvider homeHref={publicProfilePath(profileSlug)}>
      {children}
    </ProfileHomeProvider>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { AppBootSplash } from "@/components/app-boot-splash";
import { isReservedProfileSlug, publicProfilePath } from "@/lib/profile/profile-slug";
import { absoluteUrl } from "@/lib/site-url";

import { PublicProfileContent } from "./profile-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly profileSlug: string }>;
}): Promise<Metadata> {
  const { profileSlug: raw } = await params;
  const profileSlug = decodeURIComponent(raw).trim().toLowerCase();
  if (!profileSlug || isReservedProfileSlug(profileSlug)) {
    return { title: "Perfil" };
  }

  const profileUrl = absoluteUrl(publicProfilePath(profileSlug));
  const imageUrl = absoluteUrl("/brand/icon-512.png");

  return {
    title: profileSlug,
    alternates: { canonical: profileUrl },
    openGraph: {
      type: "profile",
      locale: "pt_BR",
      siteName: "Moments Forever",
      title: profileSlug,
      url: profileUrl,
      images: [{ url: imageUrl, width: 512, height: 512, alt: profileSlug }],
    },
  };
}

/** Sync shell so the Home Screen app paints the brand before profile data. */
export default function PublicProfilePage({
  params,
}: {
  readonly params: Promise<{ readonly profileSlug: string }>;
}) {
  return (
    <Suspense fallback={<AppBootSplash hint="Abrindo seu perfil…" />}>
      <PublicProfileContent params={params} />
    </Suspense>
  );
}

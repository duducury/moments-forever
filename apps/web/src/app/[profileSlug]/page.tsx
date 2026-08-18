import type { Metadata } from "next";
import { Suspense } from "react";

import { AppBootSplash } from "@/components/app-boot-splash";
import {
  isReservedProfileSlug,
  lookupPublicProfile,
  publicProfilePath,
} from "@/lib/profile/profile-slug";
import { absoluteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { title: "Perfil" };
  }

  const profile = await lookupPublicProfile(supabase, profileSlug);
  if (!profile) {
    return { title: "Perfil" };
  }

  const displayName = profile.displayName?.trim() || profile.profileSlug;
  const description =
    profile.bio?.trim() ||
    `Perfil de ${displayName} no Moments Forever.`;
  const profileUrl = absoluteUrl(publicProfilePath(profile.profileSlug));
  const imageUrl = profile.hasPermanentAvatar
    ? absoluteUrl(
        `/api/profile/${encodeURIComponent(profile.profileSlug)}/avatar`,
      )
    : absoluteUrl("/brand/icon-512.png");

  return {
    title: displayName,
    description,
    alternates: { canonical: profileUrl },
    openGraph: {
      type: "profile",
      locale: "pt_BR",
      siteName: "Moments Forever",
      title: displayName,
      description,
      url: profileUrl,
      images: [
        {
          url: imageUrl,
          width: 512,
          height: 512,
          alt: displayName,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: displayName,
      description,
      images: [imageUrl],
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

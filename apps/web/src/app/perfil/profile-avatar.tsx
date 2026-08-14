"use client";

import { useState } from "react";

import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";
import { profileAvatarBlobId } from "@/lib/profile/profile-avatar-store";

import styles from "./perfil.module.css";

export function ProfileAvatar({
  ownerId,
  avatarPhotoId,
  displayName,
  size = "lg",
  previewUrl = null,
  remoteSrc = null,
}: {
  readonly ownerId: string;
  /** Legacy trip-photo avatar id (optional fallback). */
  readonly avatarPhotoId?: string | null;
  readonly displayName: string;
  readonly size?: "lg" | "md";
  /** Live preview while picking a new phone image (before save). */
  readonly previewUrl?: string | null;
  /** R2-backed URL so the photo shows on other devices. */
  readonly remoteSrc?: string | null;
}) {
  const localAvatarId = profileAvatarBlobId(ownerId);
  const localSrc = useLocalPhotoObjectUrl(localAvatarId, "full");
  const legacySrc = useLocalPhotoObjectUrl(avatarPhotoId ?? null, "full");
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const src =
    [previewUrl, localSrc, remoteSrc, legacySrc].find(
      (candidate) => Boolean(candidate) && candidate !== brokenSrc,
    ) ?? null;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "·";

  return (
    <span
      className={styles.profileAvatar}
      data-has-image={src ? "true" : "false"}
      data-size={size}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={styles.profileAvatarImage}
          onError={() => setBrokenSrc(src)}
          src={src}
        />
      ) : (
        <span aria-hidden="true" className={styles.profileAvatarFallback}>
          {initial}
        </span>
      )}
    </span>
  );
}

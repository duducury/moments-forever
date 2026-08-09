"use client";

import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";
import { profileAvatarBlobId } from "@/lib/profile/profile-avatar-store";

import styles from "./perfil.module.css";

export function ProfileAvatar({
  ownerId,
  avatarPhotoId,
  displayName,
  size = "lg",
  previewUrl = null,
}: {
  readonly ownerId: string;
  /** Legacy trip-photo avatar id (optional fallback). */
  readonly avatarPhotoId?: string | null;
  readonly displayName: string;
  readonly size?: "lg" | "md";
  /** Live preview while picking a new phone image (before save). */
  readonly previewUrl?: string | null;
}) {
  const localAvatarId = profileAvatarBlobId(ownerId);
  const localSrc = useLocalPhotoObjectUrl(localAvatarId, "full");
  const legacySrc = useLocalPhotoObjectUrl(avatarPhotoId ?? null, "full");
  const src = previewUrl || localSrc || legacySrc;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "·";

  return (
    <span
      className={styles.profileAvatar}
      data-has-image={src ? "true" : "false"}
      data-size={size}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className={styles.profileAvatarImage} src={src} />
      ) : (
        <span aria-hidden="true" className={styles.profileAvatarFallback}>
          {initial}
        </span>
      )}
    </span>
  );
}

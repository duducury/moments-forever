"use client";

import { useState } from "react";

import { EditProfileDialog } from "./edit-profile-dialog";
import { ProfileAvatar } from "./profile-avatar";
import styles from "./perfil.module.css";

const DEFAULT_BIO = "Nossas viagens e momentos pelo mundo.";

function StatIcon({ kind }: { readonly kind: "trip" | "photo" | "country" }) {
  if (kind === "trip") {
    return (
      <svg aria-hidden="true" className={styles.profileStatIcon} fill="none" viewBox="0 0 16 16">
        <path
          d="M2.5 11.5h11M4 11.5V5.2c0-.4.3-.7.7-.7h6.6c.4 0 .7.3.7.7v6.3M6.2 4.5V3.2c0-.4.3-.7.7-.7h2.2c.4 0 .7.3.7.7v1.3"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
      </svg>
    );
  }
  if (kind === "photo") {
    return (
      <svg aria-hidden="true" className={styles.profileStatIcon} fill="none" viewBox="0 0 16 16">
        <rect
          height="10"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.35"
          width="12"
          x="2"
          y="3.5"
        />
        <circle cx="8" cy="8.5" r="2.1" stroke="currentColor" strokeWidth="1.35" />
        <path d="M5 3.5 5.7 2.4h4.6L11 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className={styles.profileStatIcon} fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M2.75 8h10.5M8 2.75c1.4 1.5 2.1 3.25 2.1 5.25S9.4 12.75 8 14.25C6.6 12.75 5.9 11 5.9 8S6.6 4.25 8 2.75Z"
        stroke="currentColor"
        strokeWidth="1.35"
      />
    </svg>
  );
}

export function ProfileHeader({
  ownerId,
  displayName,
  bio,
  avatarPhotoId,
  avatarRemoteSrc = null,
  isOwner,
  tripCount,
  photoCount,
  countryCodes,
}: {
  readonly ownerId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatarPhotoId: string | null;
  readonly avatarRemoteSrc?: string | null;
  readonly isOwner: boolean;
  readonly tripCount: number;
  readonly photoCount: number;
  readonly countryCodes: readonly string[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const savedBio = bio?.trim() || "";
  const bioText = savedBio || DEFAULT_BIO;
  const countryCount = countryCodes.length;

  return (
    <>
      <header className={styles.profileHeader}>
        <ProfileAvatar
          avatarPhotoId={avatarPhotoId}
          displayName={displayName}
          ownerId={ownerId}
          remoteSrc={avatarRemoteSrc}
        />

        <div className={styles.profileHeaderCopy}>
          <div className={styles.profileHeaderTitleRow}>
            <h1 className={styles.profileDisplayName}>{displayName}</h1>
            {isOwner ? (
              <button
                aria-label="Editar perfil"
                className={styles.editProfileButton}
                onClick={() => setEditOpen(true)}
                type="button"
              >
                Editar
              </button>
            ) : null}
          </div>
          {countryCodes.length > 0 ? (
            <ul
              aria-label="Países visitados"
              className={styles.profileCountryFlags}
            >
              {countryCodes.map((code) => (
                <li key={code}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset */}
                  <img
                    alt={code}
                    className={styles.profileCountryFlag}
                    decoding="async"
                    height={14}
                    loading="lazy"
                    src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
                    title={code}
                    width={20}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.profileBio}>{bioText}</p>
        </div>

        <ul className={styles.profileStats}>
          <li>
            <StatIcon kind="trip" />
            <span>
              <strong>{tripCount}</strong>{" "}
              {tripCount === 1 ? "viagem" : "viagens"}
            </span>
          </li>
          <li>
            <StatIcon kind="photo" />
            <span>
              <strong>{photoCount}</strong> foto{photoCount === 1 ? "" : "s"}
            </span>
          </li>
          <li>
            <StatIcon kind="country" />
            <span>
              <strong>{countryCount}</strong>{" "}
              {countryCount === 1 ? "país" : "países"}
            </span>
          </li>
        </ul>
      </header>

      {editOpen ? (
        <EditProfileDialog
          initialBio={savedBio || DEFAULT_BIO}
          initialName={displayName}
          onClose={() => setEditOpen(false)}
          ownerId={ownerId}
          remoteSrc={avatarRemoteSrc}
        />
      ) : null}
    </>
  );
}

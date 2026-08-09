"use client";

import Link from "next/link";
import { useState } from "react";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import type { OwnerExperienceListItem } from "@/lib/experiences/load-owner-experiences";
import { profileTripPath } from "@/lib/routes/app-routes";

import { EditTripDialog } from "./edit-trip-dialog";
import { MergePlacesDialog } from "./merge-places-dialog";
import styles from "./perfil.module.css";

function formatCardDate(
  startsAt: string | null,
  endsAt: string | null,
): string | null {
  const value = startsAt ?? endsAt;
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function ProfileTripCard({
  experience,
  isOwner = false,
}: {
  readonly experience: OwnerExperienceListItem;
  readonly isOwner?: boolean;
}) {
  const tripHref = profileTripPath(experience.slug);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const metaLine = [
    formatCardDate(experience.startsAt, experience.endsAt),
    `${experience.photoCount} foto${experience.photoCount === 1 ? "" : "s"}`,
    experience.placeCount > 0
      ? `${experience.placeCount} lugar${experience.placeCount === 1 ? "" : "es"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className={styles.cardRow}>
      <Link className={styles.card} href={tripHref}>
        <div className={styles.coverFrame}>
          <ExperienceCoverThumb
            className={styles.cover}
            coverPhotoId={experience.coverPhotoId}
            fallbackClassName={styles.coverFallback}
            imageClassName={styles.coverImage}
            title={experience.title}
          />
          <span aria-hidden className={styles.coverFade} />
          <div className={styles.cardTitleBlock}>
            <div className={styles.cardOverlayCopy}>
              <h3 className={styles.cardCountryLine}>
                <span>{experience.title}</span>
              </h3>
              {metaLine ? (
                <p className={styles.cardMetaLine}>{metaLine}</p>
              ) : null}
            </div>
          </div>
        </div>
      </Link>

      {isOwner ? (
        <div className={styles.cardMenu}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={styles.cardMenuButton}
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className={styles.cardMenuPanel} role="menu">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
                role="menuitem"
                type="button"
              >
                Editar / excluir
              </button>
              <button
                disabled={experience.placeCount < 2}
                onClick={() => {
                  setMenuOpen(false);
                  setMergeOpen(true);
                }}
                role="menuitem"
                type="button"
              >
                Juntar lugares
              </button>
              <Link
                href={tripHref}
                onClick={() => setMenuOpen(false)}
                role="menuitem"
              >
                Abrir viagem
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {editOpen ? (
        <EditTripDialog
          experience={experience}
          onClose={() => setEditOpen(false)}
        />
      ) : null}

      {mergeOpen ? (
        <MergePlacesDialog
          experienceId={experience.id}
          experienceTitle={experience.title}
          onClose={() => setMergeOpen(false)}
        />
      ) : null}
    </li>
  );
}

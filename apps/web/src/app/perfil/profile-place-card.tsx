"use client";

import Link from "next/link";
import { useState } from "react";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import {
  countryCodeFromPlaceLabel,
  countryNameFromPlaceLabel,
  shortPlaceCaption,
} from "@moments-forever/shared";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

import { EditPlaceDialog } from "./edit-place-dialog";
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

export function ProfilePlaceCard({
  place,
  isOwner = false,
  reorderMode = false,
}: {
  readonly place: OwnerPlaceCardItem;
  readonly isOwner?: boolean;
  readonly reorderMode?: boolean;
}) {
  const placeHref = profileTripAlbumPath(place.experienceSlug, place.albumId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const countryCode =
    place.countryCode ?? countryCodeFromPlaceLabel(place.title);
  const caption = shortPlaceCaption(place.title);
  const countryLabel =
    countryNameFromPlaceLabel(place.title) ??
    caption?.shortLabel ??
    place.title;
  const placeLine =
    place.title.trim().toLowerCase() !== countryLabel.trim().toLowerCase()
      ? place.title
      : caption?.shortLabel &&
          caption.shortLabel.trim().toLowerCase() !==
            countryLabel.trim().toLowerCase()
        ? caption.shortLabel
        : null;
  const metaLine = [
    formatCardDate(place.startsAt, place.endsAt),
    `${place.photoCount} foto${place.photoCount === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <div className={styles.coverFrame}>
      <ExperienceCoverThumb
        className={styles.cover}
        coverPhotoId={place.coverPhotoId}
        fallbackClassName={styles.coverFallback}
        imageClassName={styles.coverImage}
        title={place.title}
      />
      <span aria-hidden className={styles.coverFade} />
      <div className={styles.cardTitleBlock}>
        <div className={styles.cardOverlayCopy}>
          <p className={styles.cardCountryLine}>
            {countryCode ? (
              // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
              <img
                alt=""
                className={styles.cardFlag}
                decoding="async"
                height={15}
                loading="lazy"
                src={`https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`}
                width={20}
              />
            ) : null}
            <span>{countryLabel}</span>
          </p>
          {placeLine ? (
            <h3 className={styles.cardTitle}>{placeLine}</h3>
          ) : null}
          {metaLine ? <p className={styles.cardMetaLine}>{metaLine}</p> : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.cardRow}>
      {reorderMode ? (
        <div className={styles.card}>{body}</div>
      ) : (
        <Link className={styles.card} href={placeHref}>
          {body}
        </Link>
      )}

      {isOwner && !reorderMode ? (
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
                Editar viagem
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setMergeOpen(true);
                }}
                role="menuitem"
                type="button"
              >
                Juntar álbuns
              </button>
              <Link
                href={placeHref}
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
        <EditPlaceDialog onClose={() => setEditOpen(false)} place={place} />
      ) : null}

      {mergeOpen ? (
        <MergePlacesDialog
          experienceId={place.experienceId}
          experienceTitle={place.experienceTitle}
          onClose={() => setMergeOpen(false)}
        />
      ) : null}
    </div>
  );
}

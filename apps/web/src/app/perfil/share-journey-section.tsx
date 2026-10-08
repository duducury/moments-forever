"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { countryNameFromCode } from "@moments-forever/shared";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
import { isNativeIosApp } from "@/lib/auth/apple-sign-in";
import { mediaProxyUrl } from "@/lib/media/media-url";
import { generateJourneyImage } from "@/lib/share-journey/generate-journey-image";
import {
  MAX_FAVORITE_TRIPS,
  buildJourneySummary,
  selectionCounterLabel,
  tripDisplayName,
  type JourneyPoint,
} from "@/lib/share-journey/journey-summary";
import {
  JOURNEY_REGIONS,
  NO_TRIPS_IN_REGION_MESSAGE,
  toggleRegionTrip,
  tripsForRegion,
  type JourneyRegion,
} from "@/lib/share-journey/journey-regions";
import { shareFile } from "@/lib/share/share-link";

import styles from "./share-journey.module.css";

type Step = "closed" | "region" | "select" | "generating" | "preview";

const FILE_NAME = "meu-resumo-de-viagens-moments-forever.jpg";

async function fetchJourneyPoints(): Promise<JourneyPoint[]> {
  try {
    const response = await fetch("/api/me/journey-points", { cache: "no-store" });
    if (!response.ok) return [];
    const body = (await response.json()) as { points?: JourneyPoint[] };
    return body.points ?? [];
  } catch {
    return [];
  }
}

/**
 * Bottom of the owner's profile: "Compartilhe sua jornada". Pick up to 5
 * trips (nothing is saved), generate the 1080×1920 summary in the browser and
 * share / save it.
 */
export function ShareJourneySection({
  places,
  ownerId,
  displayName,
  bio,
  countryCodes,
  avatarRemoteSrc,
}: {
  readonly places: readonly OwnerPlaceCardItem[];
  readonly ownerId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly countryCodes: readonly string[];
  readonly avatarRemoteSrc: string | null;
}) {
  const [step, setStep] = useState<Step>("closed");
  const [region, setRegion] = useState<JourneyRegion>("world");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (step === "closed") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [step]);

  function close() {
    runRef.current += 1;
    setStep("closed");
    setBlob(null);
    setPreviewUrl(null);
    setError(null);
    setNotice(null);
  }

  async function generate() {
    const run = (runRef.current += 1);
    setError(null);
    setNotice(null);
    setStep("generating");
    try {
      const points = await fetchJourneyPoints();
      const summary = buildJourneySummary({
        region,
        places,
        displayName,
        bio,
        countryCodes,
        selectedAlbumIds: selected,
        points,
      });
      const image = await generateJourneyImage(summary, ownerId, avatarRemoteSrc);
      if (run !== runRef.current) return;
      setBlob(image);
      setPreviewUrl(URL.createObjectURL(image));
      setStep("preview");
    } catch (caught) {
      if (run !== runRef.current) return;
      setError(caught instanceof Error ? caught.message : "Não foi possível gerar o resumo.");
      setStep("select");
    }
  }

  async function share() {
    if (!blob) return;
    setNotice(null);
    const file = new File([blob], FILE_NAME, { type: blob.type || "image/jpeg" });
    const result = await shareFile(file, { title: "Minha jornada no Moments Forever" });
    if (result === "unsupported") {
      setNotice(
        "Este navegador não abre a folha de compartilhamento para imagens. Use “Salvar imagem” ou segure a imagem para salvá-la.",
      );
    }
  }

  async function save() {
    if (!blob) return;
    setNotice(null);
    // The iOS app's web view ignores downloads: its share sheet has "Salvar imagem".
    if (isNativeIosApp()) {
      const file = new File([blob], FILE_NAME, { type: blob.type || "image/jpeg" });
      const result = await shareFile(file);
      if (result === "unsupported") setNotice("Segure a imagem para salvá-la nas Fotos.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const atLimit = selected.length >= MAX_FAVORITE_TRIPS;
  const regionTrips = tripsForRegion(places, region);
  const hasTrips = regionTrips.length > 0;

  function chooseRegion(next: JourneyRegion) {
    if (next === region) return;
    setRegion(next);
    // Trips of another map are not valid here.
    setSelected([]);
  }

  return (
    <section aria-labelledby="share-journey-title" className={styles.section} data-reveal>
      <h2 className={styles.title} id="share-journey-title">
        Compartilhe sua jornada
      </h2>
      <p className={styles.lead}>Mostre ao mundo os lugares que fizeram parte da sua história.</p>
      <button className="button primary" onClick={() => setStep("region")} type="button">
        Compartilhar minha jornada no Instagram
      </button>

      {/* In a portal on <body>: above the bottom menu (z-drawer) and free of any transformed ancestor. */}
      {step !== "closed"
        ? createPortal(
        <div aria-modal="true" className={styles.overlay} role="dialog" aria-label="Compartilhe sua jornada">
          <div className={styles.sheet}>
            <header className={styles.sheetHeader}>
              <button aria-label="Fechar" className={styles.close} onClick={close} type="button">
                ×
              </button>
            </header>

            {step === "region" ? (
              <>
                <h3 className={styles.sheetTitle}>Escolha seu resumo</h3>
                <p className={styles.sheetLead}>Escolha o mapa que vai aparecer na sua imagem.</p>
                <ul className={styles.regions}>
                  {JOURNEY_REGIONS.map((option) => (
                    <li key={option.id}>
                      <button
                        aria-pressed={region === option.id}
                        className={styles.regionCard}
                        data-selected={region === option.id ? "true" : "false"}
                        onClick={() => chooseRegion(option.id)}
                        type="button"
                      >
                        <span aria-hidden="true" className={styles.regionEmoji}>
                          {option.emoji}
                        </span>
                        <span className={styles.itemText}>
                          <strong>{option.title}</strong>
                          <small>{option.description}</small>
                        </span>
                        <span aria-hidden="true" className={styles.check}>
                          {region === option.id ? "✓" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {!hasTrips ? (
                  <p className={styles.error} role="alert">
                    {NO_TRIPS_IN_REGION_MESSAGE}
                  </p>
                ) : null}
                <div className={styles.footer}>
                  <button className="button primary" disabled={!hasTrips} onClick={() => setStep("select")} type="button">
                    Continuar
                  </button>
                </div>
              </>
            ) : null}

            {step === "select" ? (
              <>
                <button className={styles.back} onClick={() => setStep("region")} type="button">
                  ‹ Trocar mapa
                </button>
                <h3 className={styles.sheetTitle}>Escolha suas viagens favoritas</h3>
                <p className={styles.sheetLead}>Selecione até 5 viagens para aparecerem no seu resumo.</p>
                <p aria-live="polite" className={styles.counter}>
                  {selectionCounterLabel(selected.length)}
                </p>
                <ul className={styles.list}>
                  {regionTrips.map((place) => {
                    const isSelected = selected.includes(place.albumId);
                    const blocked = atLimit && !isSelected;
                    const country = place.countryCode ? countryNameFromCode(place.countryCode) : null;
                    return (
                      <li key={place.albumId}>
                        <button
                          aria-pressed={isSelected}
                          className={styles.item}
                          data-selected={isSelected ? "true" : "false"}
                          disabled={blocked}
                          onClick={() => setSelected((current) => toggleRegionTrip(current, place.albumId, regionTrips, MAX_FAVORITE_TRIPS))}
                          type="button"
                        >
                          <span className={styles.thumb}>
                            {place.coverPhotoId ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img alt="" loading="lazy" src={mediaProxyUrl(place.coverPhotoId, "thumbnail")} />
                            ) : null}
                          </span>
                          <span className={styles.itemText}>
                            <strong>{tripDisplayName(place.title)}</strong>
                            {country ? <small>{country}</small> : null}
                          </span>
                          <span aria-hidden="true" className={styles.check}>
                            {isSelected ? "✓" : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}
                {!hasTrips ? (
                  <p className={styles.error} role="alert">
                    {NO_TRIPS_IN_REGION_MESSAGE}
                  </p>
                ) : null}
                <div className={styles.footer}>
                  <button className="button primary" disabled={!hasTrips} onClick={() => void generate()} type="button">
                    Gerar meu resumo
                  </button>
                </div>
              </>
            ) : null}

            {step === "generating" ? (
              <div aria-busy="true" className={styles.generating} role="status">
                <span aria-hidden="true" className={styles.spinner} />
                <p>Gerando seu resumo…</p>
              </div>
            ) : null}

            {step === "preview" && previewUrl ? (
              <>
                <h3 className={styles.sheetTitle}>Seu resumo está pronto</h3>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Prévia do seu resumo de viagens" className={styles.preview} src={previewUrl} />
                {notice ? (
                  <p className={styles.notice} role="status">
                    {notice}
                  </p>
                ) : null}
                <div className={styles.actions}>
                  <button className="button primary" onClick={() => void share()} type="button">
                    Compartilhar no Instagram
                  </button>
                  <button className="button secondary" onClick={() => void save()} type="button">
                    Salvar imagem
                  </button>
                  <button className={styles.back} onClick={() => setStep("select")} type="button">
                    Escolher outras viagens
                  </button>
                  <button className={styles.back} onClick={() => setStep("region")} type="button">
                    Trocar mapa
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>,
            document.body,
          )
        : null}
    </section>
  );
}

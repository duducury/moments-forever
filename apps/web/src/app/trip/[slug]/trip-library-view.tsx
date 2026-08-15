"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  canApplySuggestedPlaceName,
} from "@moments-forever/shared";

import { useLocalPhotoObjectUrl } from "@/lib/local-photos/use-local-photo-urls";
import {
  confirmRemoveTripLocation,
  removeLocationFromExperience,
} from "@/lib/privacy/remove-location";

import { AddPhotosPanel } from "./add-photos-panel";
import { AlbumGrid, LibraryShell, PhotoGallery } from "./album-ui";

import {
  buildBreadcrumb,
  photosWithGps,
  type TripAlbum,
  type TripExperience,
  type TripPhoto,
} from "./album-types";
import { OrganizePlacesPanel } from "./organize-places-panel";
import { buildTripHeroDisplay } from "./trip-display";
import { TripMap } from "./trip-map";
import styles from "./trip.module.css";

type TripTab = "fotos" | "lugares";

function heroTone(coverPhotoId: string | null): "a" | "b" | "c" {
  if (!coverPhotoId) return "a";
  const code = coverPhotoId.charCodeAt(0) % 3;
  return code === 0 ? "a" : code === 1 ? "b" : "c";
}

interface Props {
  readonly experience: TripExperience;
  readonly albums: readonly TripAlbum[];
  readonly photos: readonly TripPhoto[];
  readonly initialTab?: TripTab | "albuns" | "mapa" | null;
  readonly initialMapFocus?: {
    readonly latitude: number;
    readonly longitude: number;
  } | null;
  /** Same layout for everyone; owner sees edit controls. */
  readonly isOwner?: boolean;
}

export function TripLibraryView({
  experience: initialExperience,
  albums: initialAlbums,
  photos: initialPhotos,
  initialTab = null,
  initialMapFocus = null,
  isOwner = false,
}: Props) {
  const [experience, setExperience] = useState(initialExperience);
  const [albums, setAlbums] = useState(initialAlbums);
  const [photos, setPhotos] = useState(initialPhotos);
  const [mapFocus] = useState(initialMapFocus);
  const [editOpen, setEditOpen] = useState(false);
  const [addPhotosOpen, setAddPhotosOpen] = useState(false);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [identifyBusy, setIdentifyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [albumsSyncKey, setAlbumsSyncKey] = useState(initialAlbums);
  const [experienceSyncKey, setExperienceSyncKey] = useState(initialExperience);
  const [photosSyncKey, setPhotosSyncKey] = useState(initialPhotos);

  if (initialAlbums !== albumsSyncKey) {
    setAlbumsSyncKey(initialAlbums);
    setAlbums(initialAlbums);
  }
  if (initialExperience !== experienceSyncKey) {
    setExperienceSyncKey(initialExperience);
    setExperience(initialExperience);
  }
  if (initialPhotos !== photosSyncKey) {
    setPhotosSyncKey(initialPhotos);
    setPhotos(initialPhotos);
  }

  useEffect(() => {
    if (initialTab !== "fotos") return;
    const node = document.getElementById("trip-fotos");
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialTab]);

  const coverSrc = useLocalPhotoObjectUrl(experience.coverPhotoId, "full");
  const heroDisplay = useMemo(
    () => buildTripHeroDisplay(experience, albums),
    [albums, experience],
  );
  const breadcrumb = useMemo(() => {
    const items = buildBreadcrumb(experience, albums, null, { isOwner });
    return items.map((item, index) =>
      index === 1 ? { ...item, label: heroDisplay.title } : item,
    );
  }, [albums, experience, heroDisplay.title, isOwner]);
  const rootAlbumCount = albums.filter(
    (album) => album.parentAlbumId === null,
  ).length;
  const gpsCount = photosWithGps(photos).length;
  const canIdentifyPlaces = albums.some((album) => {
    const label = album.placeName ?? album.name;
    return (
      Boolean(album.placeId) &&
      canApplySuggestedPlaceName({
        name: label,
        confirmedByUser: album.placeConfirmedByUser,
      })
    );
  });

  async function onIdentifyPlaces() {
    setIdentifyBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/experiences/${experience.id}/identify-places`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        readonly updated?: number;
        readonly error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível identificar.");
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao identificar lugares.",
      );
    } finally {
      setIdentifyBusy(false);
    }
  }

  async function onRemoveTripLocation() {
    if (!confirmRemoveTripLocation()) return;
    setBusy(true);
    setError(null);
    try {
      await removeLocationFromExperience(experience.id);
      setPhotos((current) =>
        current.map((photo) => ({
          ...photo,
          exactLatitude: null,
          exactLongitude: null,
        })),
      );
      setPrivacyOpen(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao remover localização.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/experiences/${experience.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") ?? ""),
          description: String(data.get("description") ?? ""),
          starts_at: String(data.get("starts_at") ?? "") || null,
          ends_at: String(data.get("ends_at") ?? "") || null,
          primary_city: String(data.get("primary_city") ?? ""),
          primary_country: String(data.get("primary_country") ?? ""),
        }),
      });
      const payload = (await response.json()) as {
        readonly experience?: {
          readonly id: string;
          readonly slug: string;
          readonly title: string;
          readonly description: string | null;
          readonly starts_at: string | null;
          readonly ends_at: string | null;
          readonly primary_city: string | null;
          readonly primary_country: string | null;
          readonly cover_photo_id: string | null;
          readonly status: string;
        };
        readonly error?: string;
      };
      if (!response.ok || !payload.experience) {
        throw new Error(payload.error ?? "Não foi possível salvar.");
      }
      setExperience({
        id: payload.experience.id,
        ownerId: experience.ownerId,
        slug: payload.experience.slug,
        title: payload.experience.title,
        description: payload.experience.description,
        startsAt: payload.experience.starts_at,
        endsAt: payload.experience.ends_at,
        primaryCity: payload.experience.primary_city,
        primaryCountry: payload.experience.primary_country,
        coverPhotoId: payload.experience.cover_photo_id,
        status: payload.experience.status,
      });
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LibraryShell
      breadcrumb={breadcrumb}
      header={
        <>
          <div className={styles.navRow}>
            <div className={styles.actions}>
              {isOwner ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setError(null);
                      setEditOpen(true);
                    }}
                    type="button"
                  >
                    Editar viagem
                  </button>
                  <button
                    className="button secondary"
                    disabled={photos.length === 0}
                    onClick={() => {
                      setError(null);
                      setOrganizeOpen(true);
                    }}
                    type="button"
                  >
                    Organizar lugares
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setError(null);
                      setPrivacyOpen(true);
                    }}
                    type="button"
                  >
                    Privacidade
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <header className={styles.hero}>
            <div
              aria-hidden="true"
              className={styles.heroVisual}
              data-has-image={coverSrc ? "true" : "false"}
              data-tone={heroTone(experience.coverPhotoId)}
            >
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className={styles.heroImage}
                  decoding="async"
                  src={coverSrc}
                />
              ) : null}
            </div>
            <div className={styles.heroContent}>
              {heroDisplay.eyebrow ? (
                <p className={styles.eyebrow}>{heroDisplay.eyebrow}</p>
              ) : null}
              <h1 className={styles.title}>{heroDisplay.title}</h1>
              {experience.description ? (
                <p className={styles.description}>{experience.description}</p>
              ) : null}
              <p className={styles.metaLine}>
                {heroDisplay.dateLine}
                {` · ${photos.length} foto${photos.length === 1 ? "" : "s"}`}
                {` · ${rootAlbumCount} lugar${rootAlbumCount === 1 ? "" : "es"}`}
              </p>
            </div>
          </header>
        </>
      }
    >
      <div className={styles.tripLugaresLayout}>
        <section
          aria-label="Mapa da viagem"
          className={styles.albumMapSection}
          id="trip-mapa"
        >
          <div className={styles.albumMapSectionHeader}>
            <p className={styles.libraryEyebrow}>Mapa da viagem</p>
            <p className={styles.sectionHint}>
              {gpsCount > 0
                ? `${gpsCount} foto${gpsCount === 1 ? "" : "s"} com GPS · um mapa para toda a viagem`
                : "Nenhuma foto com GPS nesta viagem"}
            </p>
          </div>
          <TripMap
            emptyHint="Fotos sem GPS continuam disponíveis nos lugares e na galeria abaixo."
            emptyTitle="Não encontramos localizações nas fotos desta viagem."
            experienceSlug={experience.slug}
            focus={mapFocus}
            photos={photos}
            variant="full"
          />
        </section>

        {error && !editOpen ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <AlbumGrid
          albums={albums}
          createLabel="+ Novo lugar"
          experienceId={experience.id}
          experienceSlug={experience.slug}
          identifyBusy={identifyBusy}
          isOwner={isOwner}
          onAddPhotos={
            isOwner
              ? () => {
                  setError(null);
                  setAddPhotosOpen(true);
                }
              : undefined
          }
          onAlbumsChange={setAlbums}
          onIdentifyPlaces={
            isOwner && canIdentifyPlaces
              ? () => void onIdentifyPlaces()
              : undefined
          }
          parentAlbumId={null}
          photos={photos}
          primaryCountry={experience.primaryCountry}
          sectionHint={
            isOwner
              ? "Cada lugar é uma pasta dentro desta viagem. Use Organizar lugares para unir ou separar pastas — o GPS das fotos não muda."
              : "Lugares desta viagem."
          }
          sectionTitle="Lugares"
        />

        <section
          aria-label="Fotos da viagem"
          className={styles.albumSection}
          id="trip-fotos"
        >
          <div className={styles.albumSectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Fotos</h2>
              <p className={styles.sectionHint}>
                Todas as fotos desta viagem, incluindo as sem GPS.
              </p>
            </div>
            {isOwner ? (
              <button
                className="button primary"
                onClick={() => {
                  setError(null);
                  setAddPhotosOpen(true);
                }}
                type="button"
              >
                + Adicionar fotos
              </button>
            ) : null}
          </div>
          <PhotoGallery
            emptyLabel="Esta viagem ainda não tem fotos."
            photos={photos}
          />
        </section>
      </div>

      {editOpen ? (
        <div
          aria-label="Editar informações da viagem"
          aria-modal="true"
          className={styles.panel}
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditOpen(false);
          }}
          role="dialog"
        >
          <div className={styles.panelCard}>
            <h2>Editar viagem</h2>
            <form onSubmit={(event) => void onSaveDetails(event)}>
              <label htmlFor="title">Título</label>
              <input
                defaultValue={experience.title}
                id="title"
                name="title"
                required
              />
              <label htmlFor="description">Descrição</label>
              <textarea
                className={styles.textarea}
                defaultValue={experience.description ?? ""}
                id="description"
                name="description"
                rows={4}
              />
              <label htmlFor="starts_at">Início</label>
              <input
                defaultValue={
                  experience.startsAt ? experience.startsAt.slice(0, 10) : ""
                }
                id="starts_at"
                name="starts_at"
                type="date"
              />
              <label htmlFor="ends_at">Fim</label>
              <input
                defaultValue={
                  experience.endsAt ? experience.endsAt.slice(0, 10) : ""
                }
                id="ends_at"
                name="ends_at"
                type="date"
              />
              <label htmlFor="primary_city">Cidade</label>
              <input
                defaultValue={experience.primaryCity ?? ""}
                id="primary_city"
                name="primary_city"
              />
              <label htmlFor="primary_country">País</label>
              <input
                defaultValue={experience.primaryCountry ?? ""}
                id="primary_country"
                name="primary_country"
              />
              <div className={styles.panelActions}>
                <button className="button primary" disabled={busy} type="submit">
                  {busy ? "Salvando…" : "Salvar"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setEditOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
              {error ? <p className={styles.error}>{error}</p> : null}
            </form>
          </div>
        </div>
      ) : null}

      {addPhotosOpen ? (
        <AddPhotosPanel
          albums={albums}
          defaultAlbumId={
            albums.find((album) => album.parentAlbumId === null)?.id ?? null
          }
          experienceId={experience.id}
          onClose={() => setAddPhotosOpen(false)}
        />
      ) : null}

      {organizeOpen ? (
        <OrganizePlacesPanel
          experienceId={experience.id}
          experienceTitle={experience.title}
          onClose={() => setOrganizeOpen(false)}
          photos={photos}
        />
      ) : null}

      {privacyOpen ? (
        <div
          aria-label="Privacidade da viagem"
          aria-modal="true"
          className={styles.panel}
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setPrivacyOpen(false);
            }
          }}
          role="dialog"
        >
          <div className={styles.panelCard}>
            <h2>Privacidade</h2>
            <p className={styles.sectionHint}>
              Algumas fotos podem conter informações de localização. Você pode
              remover a localização de fotos a qualquer momento.
            </p>
            <p className={styles.sectionHint}>
              {gpsCount > 0
                ? `${gpsCount} foto${gpsCount === 1 ? "" : "s"} com localização nesta viagem.`
                : "Nenhuma foto desta viagem tem localização no Moments Forever."}
            </p>
            <div className={styles.panelActions}>
              <button
                className="button secondary"
                disabled={busy || gpsCount === 0}
                onClick={() => void onRemoveTripLocation()}
                type="button"
              >
                {busy ? "Removendo…" : "Remover localização da viagem"}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setPrivacyOpen(false)}
                type="button"
              >
                Fechar
              </button>
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </div>
      ) : null}
    </LibraryShell>
  );
}

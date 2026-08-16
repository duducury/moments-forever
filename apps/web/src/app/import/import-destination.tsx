"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import { uploadFilesToAlbum } from "@/lib/photos/upload-files-to-album";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

import styles from "./photo-import.module.css";

interface DestinationAlbum {
  readonly albumId: string;
  readonly experienceId: string;
  readonly experienceSlug: string;
  readonly title: string;
  readonly coverPhotoId: string | null;
  readonly countryCode: string | null;
  readonly photoCount: number;
}

export function ImportDestination({
  files,
  onNewTrip,
}: {
  readonly files: readonly File[];
  readonly onNewTrip: (details: {
    readonly name: string;
    readonly story: string;
  }) => void;
}) {
  const router = useRouter();
  const [albums, setAlbums] = useState<readonly DestinationAlbum[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newStory, setNewStory] = useState("");
  const continuedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/me/albums")
      .then(async (response) => {
        const payload = (await response.json()) as {
          readonly albums?: DestinationAlbum[];
          readonly error?: string;
        };
        if (!alive) return;
        if (!response.ok) {
          setLoadError(payload.error ?? "Não foi possível listar os álbuns.");
          setAlbums([]);
          return;
        }
        setAlbums(payload.albums ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setLoadError("Não foi possível listar os álbuns.");
        setAlbums([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (continuedRef.current) return;
    if (albums !== null && albums.length === 0 && !loadError) {
      continuedRef.current = true;
      onNewTrip({ name: "", story: "" });
    }
  }, [albums, loadError, onNewTrip]);

  async function addToAlbum(album: DestinationAlbum) {
    setBusy(true);
    setError(null);
    try {
      const result = await uploadFilesToAlbum({
        experienceId: album.experienceId,
        albumId: album.albumId,
        files,
        onProgress: setProgress,
      });
      if (result.cloudWarning) {
        setError(
          `Fotos guardadas neste aparelho, mas o envio à nuvem falhou: ${result.cloudWarning}`,
        );
        return;
      }
      router.replace(
        profileTripAlbumPath(album.experienceSlug, album.albumId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar fotos.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const count = files.length;

  return (
    <section className={styles.destination}>
      <p className="eyebrow">Adicionar fotos</p>
      <h1>
        {count} foto{count === 1 ? "" : "s"} escolhida{count === 1 ? "" : "s"}
      </h1>
      <p className={styles.lead}>
        Crie um álbum novo ou escolha um que você já tem.
      </p>

      <div className={styles.destinationNew}>
        <p className={styles.destinationLabel}>Criar novo álbum de viagem</p>
        <label htmlFor="new-album-name">Nome do álbum</label>
        <input
          disabled={busy}
          id="new-album-name"
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Jamaica, Paris…"
          value={newName}
        />
        <label htmlFor="new-album-story">Sobre essa viagem</label>
        <textarea
          disabled={busy}
          id="new-album-story"
          maxLength={4000}
          onChange={(event) => setNewStory(event.target.value)}
          placeholder="O que essa viagem significou para você?"
          rows={5}
          value={newStory}
        />
        <button
          className="button primary"
          disabled={busy || !newName.trim()}
          onClick={() =>
            onNewTrip({ name: newName.trim(), story: newStory.trim() })
          }
          type="button"
        >
          Criar e continuar
        </button>
      </div>

      {albums === null ? (
        <p className={styles.lead}>Carregando seus álbuns…</p>
      ) : null}

      {albums && albums.length > 0 ? (
        <>
          <p className={styles.destinationLabel}>Ou escolher um álbum</p>
          <ul className={styles.destinationList}>
            {albums.map((album) => (
              <li key={album.albumId}>
                <button
                  className={styles.destinationAlbum}
                  disabled={busy}
                  onClick={() => void addToAlbum(album)}
                  type="button"
                >
                  <ExperienceCoverThumb
                    className={styles.destinationCover}
                    coverPhotoId={album.coverPhotoId}
                    fallbackClassName={styles.destinationCoverFallback}
                    imageClassName={styles.destinationCoverImage}
                    title={album.title}
                    variant="thumbnail"
                  />
                  <span className={styles.destinationAlbumCopy}>
                    <strong>
                      {album.countryCode ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
                        <img
                          alt=""
                          className={styles.destinationFlag}
                          decoding="async"
                          height={15}
                          src={`https://flagcdn.com/w40/${album.countryCode.toLowerCase()}.png`}
                          width={20}
                        />
                      ) : null}
                      {album.title}
                    </strong>
                    <span>
                      {album.photoCount} foto
                      {album.photoCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {progress ? <p className={styles.lead}>{progress}</p> : null}
      {error || loadError ? (
        <p className={styles.error} role="alert">
          {error ?? loadError}
        </p>
      ) : null}
    </section>
  );
}

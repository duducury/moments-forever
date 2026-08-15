"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createTripAlbum,
  uploadFilesToAlbum,
} from "@/lib/photos/upload-files-to-album";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

import styles from "./photo-import.module.css";

interface DestinationAlbum {
  readonly albumId: string;
  readonly experienceId: string;
  readonly experienceSlug: string;
  readonly experienceTitle: string;
  readonly title: string;
  readonly photoCount: number;
}

export function ImportDestination({
  files,
  onNewTrip,
}: {
  readonly files: readonly File[];
  readonly onNewTrip: () => void;
}) {
  const router = useRouter();
  const [albums, setAlbums] = useState<readonly DestinationAlbum[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newTripId, setNewTripId] = useState("");
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

  const trips = useMemo(() => {
    const seen = new Map<string, string>();
    for (const album of albums ?? []) {
      if (!seen.has(album.experienceId)) {
        seen.set(album.experienceId, album.experienceTitle);
      }
    }
    return [...seen.entries()].map(([id, title]) => ({ id, title }));
  }, [albums]);

  useEffect(() => {
    if (trips.length === 0) return;
    if (!newTripId) setNewTripId(trips[0]?.id ?? "");
  }, [newTripId, trips]);

  useEffect(() => {
    if (continuedRef.current) return;
    if (albums !== null && albums.length === 0 && !loadError) {
      continuedRef.current = true;
      onNewTrip();
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

  async function createAlbumAndAdd() {
    const name = newName.trim();
    if (!name || !newTripId) {
      setError("Escolha a viagem e um nome para o álbum.");
      return;
    }
    const trip = (albums ?? []).find((item) => item.experienceId === newTripId);
    if (!trip) {
      setError("Viagem inválida.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setProgress("Criando álbum…");
      const albumId = await createTripAlbum(newTripId, name);
      const result = await uploadFilesToAlbum({
        experienceId: newTripId,
        albumId,
        files,
        onProgress: setProgress,
      });
      if (result.cloudWarning) {
        setError(
          `Fotos guardadas neste aparelho, mas o envio à nuvem falhou: ${result.cloudWarning}`,
        );
        return;
      }
      router.replace(profileTripAlbumPath(trip.experienceSlug, albumId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar o álbum.");
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
        Coloque neste álbum de uma viagem, crie um álbum novo, ou comece uma
        viagem nova.
      </p>

      {albums === null ? (
        <p className={styles.lead}>Carregando seus álbuns…</p>
      ) : null}

      {albums && albums.length > 0 ? (
        <ul className={styles.destinationList}>
          {albums.map((album) => (
            <li key={album.albumId}>
              <button
                className={styles.destinationAlbum}
                disabled={busy}
                onClick={() => void addToAlbum(album)}
                type="button"
              >
                <strong>{album.title}</strong>
                <span>
                  {album.experienceTitle} · {album.photoCount} foto
                  {album.photoCount === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {trips.length > 0 ? (
        <div className={styles.destinationNew}>
          <p className={styles.destinationLabel}>Criar novo álbum</p>
          <label htmlFor="new-album-trip">Viagem</label>
          <select
            disabled={busy}
            id="new-album-trip"
            onChange={(event) => setNewTripId(event.target.value)}
            value={newTripId}
          >
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title}
              </option>
            ))}
          </select>
          <label htmlFor="new-album-name">Nome do álbum</label>
          <input
            disabled={busy}
            id="new-album-name"
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Jamaica, Paris…"
            value={newName}
          />
          <button
            className="button secondary"
            disabled={busy || !newName.trim()}
            onClick={() => void createAlbumAndAdd()}
            type="button"
          >
            Criar e adicionar fotos
          </button>
        </div>
      ) : null}

      <button
        className="button primary"
        disabled={busy}
        onClick={onNewTrip}
        type="button"
      >
        Nova viagem
      </button>

      {progress ? <p className={styles.lead}>{progress}</p> : null}
      {error || loadError ? (
        <p className={styles.error} role="alert">
          {error ?? loadError}
        </p>
      ) : null}
    </section>
  );
}

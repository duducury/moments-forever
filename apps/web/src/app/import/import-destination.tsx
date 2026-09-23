"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import { useAuth } from "@/components/auth-provider";
import {
  createNamedTripFromFiles,
  TripLicenseError,
  type TripLicenseErrorCode,
} from "@/lib/photos/create-named-trip-from-files";
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

function formatActivationCodeInput(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutPrefix = cleaned.startsWith("MF") ? cleaned.slice(2) : cleaned;
  const groups = [
    withoutPrefix.slice(0, 4),
    withoutPrefix.slice(4, 8),
    withoutPrefix.slice(8, 10),
  ].filter(Boolean);
  return groups.length > 0 ? `MF-${groups.join("-")}` : "";
}

export function ImportDestination({
  files,
}: {
  readonly files: readonly File[];
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [albums, setAlbums] = useState<readonly DestinationAlbum[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newStory, setNewStory] = useState("");
  const [licenseBlock, setLicenseBlock] = useState<{
    readonly code: TripLicenseErrorCode;
    readonly message: string;
  } | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [activating, setActivating] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(
    null,
  );

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

  async function createNewAlbum() {
    const name = newName.trim();
    if (!name) {
      setError("Escolha um nome para o álbum.");
      return;
    }
    if (authLoading) {
      setError("Aguarde a verificação da sessão.");
      return;
    }
    if (!user) {
      setError("Entre na sua conta para criar o álbum.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await createNamedTripFromFiles({
        files,
        name,
        story: newStory,
        ownerId: user.id,
        onProgress: setProgress,
      });
      if (result.cloudWarning) {
        setError(
          `Álbum criado, mas o envio à nuvem falhou: ${result.cloudWarning}`,
        );
        return;
      }
      router.replace(profileTripAlbumPath(result.slug, result.albumId));
    } catch (err) {
      if (err instanceof TripLicenseError) {
        setLicenseBlock({ code: err.code, message: err.message });
        return;
      }
      setError(err instanceof Error ? err.message : "Falha ao criar o álbum.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function activateInlineCode() {
    const trimmed = activationCode.trim().toUpperCase();
    if (!/^MF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(trimmed)) {
      setActivationMessage("Digite o código no formato MF-XXXX-XXXX-XX.");
      return;
    }
    setActivating(true);
    setActivationMessage(null);
    try {
      const response = await fetch("/api/activation/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        readonly error?: string;
      };
      if (!response.ok) {
        setActivationMessage(data.error ?? "Não foi possível ativar a key.");
        return;
      }
      setActivationCode("");
      setLicenseBlock(null);
      await createNewAlbum();
    } finally {
      setActivating(false);
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

      {licenseBlock ? (
        <div className={styles.destinationNew}>
          <p className={styles.destinationLabel}>
            {licenseBlock.code === "trip_limit_reached"
              ? "Limite de viagens atingido"
              : "Você precisa ativar uma key"}
          </p>
          <p className={styles.lead}>{licenseBlock.message}</p>
          <label htmlFor="inline-activation-code">Código de ativação</label>
          <input
            disabled={activating}
            id="inline-activation-code"
            onChange={(event) =>
              setActivationCode(formatActivationCodeInput(event.target.value))
            }
            placeholder="MF-____-____-__"
            value={activationCode}
          />
          <button
            className="button primary"
            disabled={activating || !activationCode.trim()}
            onClick={() => void activateInlineCode()}
            type="button"
          >
            {activating ? "Ativando…" : "Ativar"}
          </button>
          {activationMessage ? (
            <p className={styles.error} role="alert">
              {activationMessage}
            </p>
          ) : null}
        </div>
      ) : (
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
            onClick={() => void createNewAlbum()}
            type="button"
          >
            Criar álbum
          </button>
        </div>
      )}

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

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { MergeAlbumsMode } from "@/lib/experiences/merge-albums";

import styles from "./perfil.module.css";

interface AlbumOption {
  readonly id: string;
  readonly name: string;
  readonly parent_album_id: string | null;
  readonly photo_count: number;
}

export function MergePlacesDialog({
  experienceId,
  experienceTitle,
  onClose,
}: {
  readonly experienceId: string;
  readonly experienceTitle: string;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [albums, setAlbums] = useState<readonly AlbumOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [mode, setMode] = useState<MergeAlbumsMode>("photos");
  const [name, setName] = useState("");
  const [targetAlbumId, setTargetAlbumId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/experiences/${experienceId}/albums`,
        );
        const payload = (await response.json()) as {
          readonly albums?: readonly AlbumOption[];
          readonly error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Não foi possível carregar lugares.");
        }
        if (!cancelled) {
          const roots = (payload.albums ?? []).filter(
            (album) => album.parent_album_id === null,
          );
          setAlbums(roots);
          setTargetAlbumId(roots[0]?.id ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao carregar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [experienceId]);

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onConfirm() {
    if (selectedIds.size < 2) {
      setError("Selecione pelo menos dois lugares.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/experiences/${experienceId}/merge-albums`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode,
            album_ids: [...selectedIds],
            target_album_id:
              mode === "photos"
                ? targetAlbumId || [...selectedIds][0]
                : undefined,
            name: name.trim() || undefined,
          }),
        },
      );
      const payload = (await response.json()) as { readonly error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível juntar.");
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao juntar.");
    } finally {
      setBusy(false);
    }
  }

  const selectedList = albums.filter((album) => selectedIds.has(album.id));

  return (
    <div
      aria-label="Juntar lugares"
      aria-modal="true"
      className={styles.dialogBackdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className={`${styles.dialogCard} ${styles.dialogCardWide}`}>
        <h2 className={styles.dialogTitle}>Juntar lugares</h2>
        <p className={styles.fieldHint}>
          Em <strong>{experienceTitle}</strong>. O GPS das fotos não muda —
          só a organização das pastas.
        </p>

        {loading ? <p className={styles.fieldHint}>Carregando lugares…</p> : null}

        {!loading && albums.length < 2 ? (
          <p className={styles.fieldHint}>
            É preciso ter pelo menos dois lugares nesta viagem para juntar.
          </p>
        ) : null}

        {!loading && albums.length >= 2 ? (
          <>
            <p className={styles.fieldLabel}>Selecione os lugares</p>
            <ul className={styles.placeChecklist}>
              {albums.map((album) => {
                const checked = selectedIds.has(album.id);
                return (
                  <li key={album.id}>
                    <label className={styles.placeCheckItem}>
                      <input
                        checked={checked}
                        onChange={() => toggle(album.id)}
                        type="checkbox"
                      />
                      <span>
                        {album.name}
                        <span className={styles.placeMeta}>
                          {" "}
                          · {album.photo_count} foto
                          {album.photo_count === 1 ? "" : "s"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <fieldset className={styles.modePicker}>
              <legend>Como juntar</legend>
              <label className={styles.modeOption}>
                <input
                  checked={mode === "photos"}
                  name="merge-mode"
                  onChange={() => setMode("photos")}
                  type="radio"
                />
                <span>
                  <strong>Todas as imagens juntas</strong>
                  <span className={styles.fieldHint}>
                    Move as fotos para um único lugar e remove as pastas
                    vazias.
                  </span>
                </span>
              </label>
              <label className={styles.modeOption}>
                <input
                  checked={mode === "nested"}
                  name="merge-mode"
                  onChange={() => setMode("nested")}
                  type="radio"
                />
                <span>
                  <strong>Pastas separadas dentro de uma pasta</strong>
                  <span className={styles.fieldHint}>
                    Cria uma pasta pai e mantém os lugares selecionados como
                    subpastas.
                  </span>
                </span>
              </label>
            </fieldset>

            <label htmlFor="merge-name">
              {mode === "nested" ? "Nome da pasta pai" : "Nome do lugar final"}
            </label>
            <input
              id="merge-name"
              onChange={(event) => setName(event.target.value)}
              placeholder={
                mode === "nested"
                  ? "Ex.: Indonésia"
                  : selectedList[0]?.name ?? "Ex.: Bali"
              }
              value={name}
            />

            {mode === "photos" && selectedList.length >= 2 ? (
              <>
                <label htmlFor="merge-target">Manter como destino</label>
                <select
                  id="merge-target"
                  onChange={(event) => setTargetAlbumId(event.target.value)}
                  value={
                    selectedIds.has(targetAlbumId)
                      ? targetAlbumId
                      : (selectedList[0]?.id ?? "")
                  }
                >
                  {selectedList.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </>
        ) : null}

        <div className={styles.dialogActions}>
          <button
            className="button primary"
            disabled={busy || loading || selectedIds.size < 2}
            onClick={() => void onConfirm()}
            type="button"
          >
            {busy ? "Juntando…" : "Juntar"}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
        </div>
        {error ? (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

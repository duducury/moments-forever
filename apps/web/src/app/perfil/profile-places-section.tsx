"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
import {
  applyPlaceOrder,
  getPlaceOrderPrefs,
  setPlaceOrderPrefs,
  subscribePlaceOrderPrefs,
} from "@/lib/profile/place-order-prefs";

import { ProfilePlaceCard } from "./profile-place-card";
import styles from "./perfil.module.css";

async function syncAlbumPositions(
  ordered: readonly OwnerPlaceCardItem[],
): Promise<void> {
  const byExperience = new Map<string, string[]>();
  for (const place of ordered) {
    const list = byExperience.get(place.experienceId) ?? [];
    list.push(place.albumId);
    byExperience.set(place.experienceId, list);
  }

  const updates: Promise<Response>[] = [];
  for (const albumIds of byExperience.values()) {
    albumIds.forEach((albumId, index) => {
      updates.push(
        fetch(`/api/albums/${albumId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position: index + 1 }),
        }),
      );
    });
  }
  await Promise.all(updates);
}

export function ProfilePlacesSection({
  places: initialPlaces,
  isOwner,
  totalPhotos,
}: {
  readonly places: readonly OwnerPlaceCardItem[];
  readonly isOwner: boolean;
  readonly totalPhotos: number;
}) {
  const orderKey = useSyncExternalStore(
    subscribePlaceOrderPrefs,
    () => getPlaceOrderPrefs().join("|"),
    () => "",
  );
  const orderedPlaces = useMemo(
    () =>
      applyPlaceOrder(
        [...initialPlaces],
        orderKey.length > 0 ? orderKey.split("|") : [],
      ),
    [initialPlaces, orderKey],
  );

  const [draft, setDraft] = useState<OwnerPlaceCardItem[] | null>(null);
  const [dragAlbumId, setDragAlbumId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touchPickId, setTouchPickId] = useState<string | null>(null);

  const editing = draft !== null;
  const items = draft ?? orderedPlaces;

  function moveItem(fromId: string, toId: string) {
    if (fromId === toId) return;
    setDraft((current) => {
      const source = current ?? orderedPlaces;
      const from = source.findIndex((item) => item.albumId === fromId);
      const to = source.findIndex((item) => item.albumId === toId);
      if (from < 0 || to < 0) return current;
      const next = [...source];
      const [removed] = next.splice(from, 1);
      if (!removed) return current;
      next.splice(to, 0, removed);
      return next;
    });
  }

  function onDragStart(albumId: string, event: ReactDragEvent) {
    if (!editing) return;
    setDragAlbumId(albumId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", albumId);
  }

  function onDragOver(albumId: string, event: ReactDragEvent) {
    if (!editing || !dragAlbumId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (albumId !== dragAlbumId) {
      moveItem(dragAlbumId, albumId);
    }
  }

  function onDragEnd() {
    setDragAlbumId(null);
  }

  function onPointerActivate(albumId: string, event: ReactPointerEvent) {
    if (!editing) return;
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    if (!touchPickId) {
      setTouchPickId(albumId);
      return;
    }
    if (touchPickId === albumId) {
      setTouchPickId(null);
      return;
    }
    moveItem(touchPickId, albumId);
    setTouchPickId(null);
  }

  async function onConfirm() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      setPlaceOrderPrefs(draft.map((item) => item.albumId));
      await syncAlbumPositions(draft);
      setDraft(null);
      setTouchPickId(null);
    } catch {
      setError("Não foi possível salvar a ordem.");
    } finally {
      setBusy(false);
    }
  }

  function onCancel() {
    setDraft(null);
    setTouchPickId(null);
    setError(null);
  }

  return (
    <section
      aria-label="Viagens"
      className={styles.tripsSection}
      id="viagens"
    >
      <div className={styles.sectionHeading}>
        <div className={styles.sectionHeadingMain}>
          <h2 className={styles.sectionTitle}>Viagens</h2>
          {isOwner ? (
            editing ? (
              <div className={styles.sectionHeadingActions}>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void onConfirm()}
                  type="button"
                >
                  {busy ? "Salvando…" : "OK"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={onCancel}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                className={styles.sectionEditButton}
                onClick={() => setDraft([...orderedPlaces])}
                type="button"
              >
                Editar
              </button>
            )
          ) : null}
        </div>
        <p className={styles.sectionMeta}>
          {items.length} {items.length === 1 ? "viagem" : "viagens"}
          {totalPhotos > 0
            ? ` · ${totalPhotos} foto${totalPhotos === 1 ? "" : "s"}`
            : ""}
          {editing
            ? " · Arraste para reordenar (no celular: toque origem e destino)"
            : ""}
        </p>
      </div>

      {error ? (
        <p className={styles.dialogError} role="alert">
          {error}
        </p>
      ) : null}

      <ul className={styles.grid} data-reorder={editing ? "true" : "false"}>
        {items.map((place) => (
          <li
            className={styles.reorderItem}
            data-dragging={dragAlbumId === place.albumId ? "true" : "false"}
            data-picked={touchPickId === place.albumId ? "true" : "false"}
            draggable={editing}
            key={place.albumId}
            onDragEnd={onDragEnd}
            onDragOver={(event) => onDragOver(place.albumId, event)}
            onDragStart={(event) => onDragStart(place.albumId, event)}
            onPointerUp={(event) => onPointerActivate(place.albumId, event)}
          >
            {editing ? (
              <span aria-hidden="true" className={styles.dragHandle}>
                ⋮⋮
              </span>
            ) : null}
            <ProfilePlaceCard
              isOwner={isOwner && !editing}
              place={place}
              reorderMode={editing}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

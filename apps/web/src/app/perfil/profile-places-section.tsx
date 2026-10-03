"use client";

import {
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  comparePlaceRecency,
  type OwnerPlaceCardItem,
} from "@/lib/experiences/load-owner-place-cards";
import {
  filterPlacesByYear,
  placeYearOptions,
  type PlaceYearFilter,
} from "@/lib/experiences/place-years";
import { setPlaceOrderPrefs } from "@/lib/profile/place-order-prefs";

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
  const datedPlaces = useMemo(
    () => [...initialPlaces].sort(comparePlaceRecency),
    [initialPlaces],
  );

  const [draft, setDraft] = useState<OwnerPlaceCardItem[] | null>(null);
  const [dragAlbumId, setDragAlbumId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touchPickId, setTouchPickId] = useState<string | null>(null);

  const [yearFilter, setYearFilter] = useState<PlaceYearFilter>("all");

  const editing = draft !== null;
  const items = draft ?? datedPlaces;

  const yearOptions = useMemo(
    () => placeYearOptions(datedPlaces),
    [datedPlaces],
  );
  // A year that no longer has trips (the list changed) counts as Todos.
  const validFilter: PlaceYearFilter =
    (typeof yearFilter === "number" && !yearOptions.years.includes(yearFilter)) ||
    (yearFilter === "none" && !yearOptions.hasUndated)
      ? "all"
      : yearFilter;
  // Reordering always works on the whole list; the filter only applies when browsing.
  const effectiveFilter: PlaceYearFilter = editing ? "all" : validFilter;
  const shown = useMemo(
    () => filterPlacesByYear(items, effectiveFilter),
    [items, effectiveFilter],
  );
  const shownPhotos =
    effectiveFilter === "all"
      ? totalPhotos
      : shown.reduce((sum, place) => sum + place.photoCount, 0);
  // One year (or none) has nothing to filter between — keep the header quiet.
  const showYearFilter =
    !editing &&
    yearOptions.years.length + (yearOptions.hasUndated ? 1 : 0) >= 2;

  function moveItem(fromId: string, toId: string) {
    if (fromId === toId) return;
    setDraft((current) => {
      const source = current ?? datedPlaces;
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
      data-reveal
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
                onClick={() => setDraft([...datedPlaces])}
                type="button"
              >
                Editar
              </button>
            )
          ) : null}
        </div>
        <p className={styles.sectionMeta}>
          {shown.length} {shown.length === 1 ? "viagem" : "viagens"}
          {shownPhotos > 0
            ? ` · ${shownPhotos} foto${shownPhotos === 1 ? "" : "s"}`
            : ""}
          {editing
            ? " · Arraste para reordenar (no celular: toque origem e destino)"
            : ""}
        </p>
        {showYearFilter ? (
          <div aria-label="Filtrar viagens por ano" className={styles.yearFilter} role="group">
            <button
              aria-pressed={validFilter === "all"}
              className={styles.yearChip}
              onClick={() => setYearFilter("all")}
              type="button"
            >
              Todos
            </button>
            {yearOptions.years.map((year) => (
              <button
                aria-pressed={validFilter === year}
                className={styles.yearChip}
                key={year}
                onClick={() => setYearFilter(year)}
                type="button"
              >
                {year}
              </button>
            ))}
            {yearOptions.hasUndated ? (
              <button
                aria-pressed={validFilter === "none"}
                className={styles.yearChip}
                onClick={() => setYearFilter("none")}
                type="button"
              >
                Sem data
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className={styles.dialogError} role="alert">
          {error}
        </p>
      ) : null}

      <ul
        className={styles.grid}
        data-reorder={editing ? "true" : "false"}
        data-reveal-stagger
      >
        {shown.map((place) => (
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

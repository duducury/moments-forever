"use client";

import type {
  ImportOrganizationMode,
  PhotoImportGroup,
} from "@moments-forever/shared";
import {
  buildImportOrganizationChildren,
  shortPlaceFolderName,
  suggestImportRootName,
} from "@moments-forever/shared";

import styles from "./organize-places-step.module.css";

const OPTIONS: readonly {
  readonly mode: ImportOrganizationMode;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
}[] = [
  {
    mode: "separate",
    icon: "📍",
    title: "Manter lugares separados",
    description:
      "Usar o GPS das fotos para separar automaticamente os lugares.",
  },
  {
    mode: "single",
    icon: "📁",
    title: "Unir tudo em um lugar",
    description: "Colocar todas as fotos selecionadas dentro de um único lugar da viagem.",
  },
  {
    mode: "nested",
    icon: "📂",
    title: "Unir em um lugar com subpastas",
    description:
      "Criar um lugar principal e organizar os locais como subpastas.",
  },
];

export function OrganizePlacesStep({
  groups,
  selectedIds,
  photoCount,
  mode,
  rootName,
  childNames,
  experienceTitle,
  onModeChange,
  onRootNameChange,
  onChildNameChange,
  onBack,
  onConfirm,
  busy,
  error,
  confirmLabel = "Aplicar",
  busyLabel = "Organizando…",
}: {
  readonly groups: readonly PhotoImportGroup[];
  readonly selectedIds: readonly string[];
  readonly photoCount: number;
  readonly mode: ImportOrganizationMode;
  readonly rootName: string;
  readonly childNames: Readonly<Record<string, string>>;
  readonly experienceTitle: string;
  readonly onModeChange: (mode: ImportOrganizationMode) => void;
  readonly onRootNameChange: (name: string) => void;
  readonly onChildNameChange: (groupId: string, name: string) => void;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly confirmLabel?: string;
  readonly busyLabel?: string;
}) {
  const children = buildImportOrganizationChildren(groups, selectedIds);
  const suggestedRoot =
    rootName.trim() ||
    suggestImportRootName(groups, selectedIds, experienceTitle);

  return (
    <section className={styles.organize}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Organização</p>
          <h1>Como você quer organizar suas fotos?</h1>
        </div>
        <p className={styles.meta}>
          {photoCount} foto{photoCount === 1 ? "" : "s"} · uma única viagem
        </p>
      </header>

      <p className={styles.lead}>
        O GPS continua nas fotos e no mapa. Você só escolhe como as pastas
        ficam dentro desta viagem.
      </p>

      <div className={styles.options} role="radiogroup">
        {OPTIONS.map((option) => {
          const selected = mode === option.mode;
          return (
            <button
              aria-checked={selected}
              className={styles.option}
              data-selected={selected ? "true" : "false"}
              disabled={busy}
              key={option.mode}
              onClick={() => onModeChange(option.mode)}
              role="radio"
              type="button"
            >
              <span aria-hidden="true" className={styles.icon}>
                {option.icon}
              </span>
              <span className={styles.optionCopy}>
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </span>
            </button>
          );
        })}
      </div>

      {mode === "separate" ? (
        <div className={styles.preview}>
          <p className={styles.previewTitle}>Prévia</p>
          <ul>
            {children.map((child) => (
              <li key={child.groupId}>
                <span>
                  📍{" "}
                  {groups.find((group) => group.id === child.groupId)?.label ??
                    child.name}
                </span>
                <span>
                  {child.photoIds.length} foto
                  {child.photoIds.length === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mode === "single" || mode === "nested" ? (
        <div className={styles.fields}>
          <label htmlFor="organize-root-name">
            {mode === "nested" ? "Nome do lugar principal" : "Nome do lugar"}
          </label>
          <input
            disabled={busy}
            id="organize-root-name"
            onChange={(event) => onRootNameChange(event.target.value)}
            placeholder={suggestedRoot}
            type="text"
            value={rootName}
          />
        </div>
      ) : null}

      {mode === "single" ? (
        <div className={styles.preview}>
          <p className={styles.previewTitle}>Prévia</p>
          <ul>
            <li>
              <span>📁 {rootName.trim() || suggestedRoot}</span>
              <span>
                {photoCount} foto{photoCount === 1 ? "" : "s"}
              </span>
            </li>
          </ul>
        </div>
      ) : null}

      {mode === "nested" ? (
        <div className={styles.fields}>
          <p className={styles.previewTitle}>Sublugares</p>
          <ul className={styles.childList}>
            {children.map((child) => (
              <li key={child.groupId}>
                <label className={styles.childLabel}>
                  <span>
                    {child.photoIds.length} foto
                    {child.photoIds.length === 1 ? "" : "s"}
                  </span>
                  <input
                    disabled={busy}
                    onChange={(event) =>
                      onChildNameChange(child.groupId, event.target.value)
                    }
                    type="text"
                    value={
                      childNames[child.groupId] ??
                      shortPlaceFolderName(
                        groups.find((group) => group.id === child.groupId)
                          ?.label ?? child.name,
                      )
                    }
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          className="button secondary"
          disabled={busy}
          onClick={onBack}
          type="button"
        >
          Voltar
        </button>
        <button
          className="button primary"
          disabled={busy || photoCount === 0}
          onClick={onConfirm}
          type="button"
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </section>
  );
}

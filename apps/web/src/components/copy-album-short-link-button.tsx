"use client";

import { useRef, useState } from "react";

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  document.body.removeChild(field);
}

/** Copies the album's short /a/{code} link — small enough for an NFC tag. */
export function CopyAlbumShortLinkButton({
  albumId,
  className,
}: {
  readonly albumId: string;
  readonly className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">(
    "idle",
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleClick() {
    if (state === "busy") return;
    setState("busy");
    try {
      const response = await fetch(`/api/albums/${albumId}/short-link`);
      const payload = (await response.json()) as {
        readonly url?: string;
        readonly error?: string;
      };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Falha ao gerar link curto.");
      }
      await copyText(payload.url);
      setState("copied");
    } catch {
      setState("error");
    } finally {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setState("idle"), 2200);
    }
  }

  const label =
    state === "copied"
      ? "Link copiado!"
      : state === "error"
        ? "Erro, tenta de novo"
        : "Copiar link curto (NFC)";

  return (
    <button
      className={className}
      disabled={state === "busy"}
      onClick={() => void handleClick()}
      title="Link curto — cabe em tags NFC"
      type="button"
    >
      {label}
    </button>
  );
}

"use client";

/**
 * Uploads the cropped profile avatar to private R2 via presigned PUT,
 * then confirms `users.avatar_storage_key` for share previews.
 */

export async function uploadProfileAvatarToR2(file: Blob): Promise<string> {
  const contentType = file.type || "image/jpeg";
  const prepare = await fetch("/api/profile/avatar/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
  const prepared = (await prepare.json()) as {
    readonly uploadUrl?: string;
    readonly key?: string;
    readonly error?: string;
  };
  if (!prepare.ok || !prepared.uploadUrl || !prepared.key) {
    throw new Error(prepared.error ?? "Não foi possível preparar o avatar.");
  }

  let putResponse: Response;
  try {
    putResponse = await fetch(prepared.uploadUrl, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: file,
    });
  } catch {
    throw new Error(
      "Não foi possível enviar o avatar (rede ou CORS do R2).",
    );
  }
  if (!putResponse.ok) {
    throw new Error(`Falha ao enviar o avatar (${putResponse.status}).`);
  }

  const confirm = await fetch("/api/profile/avatar/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ storageKey: prepared.key }),
  });
  const payload = (await confirm.json()) as { readonly error?: string };
  if (!confirm.ok) {
    throw new Error(payload.error ?? "Falha ao confirmar o avatar.");
  }
  return prepared.key;
}

export async function clearProfileAvatarFromR2(): Promise<void> {
  const confirm = await fetch("/api/profile/avatar/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ storageKey: null }),
  });
  const payload = (await confirm.json()) as { readonly error?: string };
  if (!confirm.ok) {
    throw new Error(payload.error ?? "Falha ao remover o avatar.");
  }
}

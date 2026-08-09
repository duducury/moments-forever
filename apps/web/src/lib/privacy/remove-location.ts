/**
 * Client helpers for clearing photo GPS metadata in Moments Forever.
 * Does not touch IndexedDB blobs or album membership.
 */

export function confirmRemovePhotoLocation(count: number): boolean {
  if (count <= 0) return false;
  if (count === 1) {
    return window.confirm(
      [
        "Remover localização?",
        "",
        "Esta foto continuará salva no Moments Forever, mas não terá mais uma localização associada. Ela deixará de aparecer no mapa como uma foto localizada.",
      ].join("\n"),
    );
  }
  return window.confirm(
    [
      `Remover localização de ${count} fotos?`,
      "",
      "Essa ação removerá os dados de localização dessas fotos.",
    ].join("\n"),
  );
}

export function confirmRemoveTripLocation(): boolean {
  return window.confirm(
    [
      "Remover localização",
      "",
      "Isso removerá as informações de localização de todas as fotos desta viagem e elas deixarão de aparecer como fotos localizadas no mapa.",
    ].join("\n"),
  );
}

export async function removeLocationFromPhotos(
  photoIds: readonly string[],
): Promise<void> {
  for (const photoId of photoIds) {
    const response = await fetch(`/api/photos/${photoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remove_location: true }),
    });
    const payload = (await response.json()) as { readonly error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Não foi possível remover a localização.");
    }
  }
}

export async function removeLocationFromExperience(
  experienceId: string,
): Promise<number> {
  const response = await fetch(
    `/api/experiences/${experienceId}/remove-location`,
    { method: "POST" },
  );
  const payload = (await response.json()) as {
    readonly error?: string;
    readonly updatedCount?: number;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Não foi possível remover a localização.");
  }
  return payload.updatedCount ?? 0;
}

/**
 * Display and confirmation rules for place/album location names.
 *
 * Reverse geocoding (Nominatim) may write a suggested label into `places.name`
 * only when {@link canApplySuggestedPlaceName} returns true — never invent
 * names and never overwrite a user-confirmed non-generic label.
 */

const COORDINATE_SUFFIX =
  /\s·\s*-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?\s*$/u;

export function cleanLocationLabel(label: string): string {
  return label.replace(COORDINATE_SUFFIX, "").trim();
}

export function isGenericLocationLabel(label: string): boolean {
  const cleaned = cleanLocationLabel(label);
  if (!cleaned) return true;
  // Legacy import labels ("Local N") and current place fallbacks ("Lugar N").
  if (/^local\s+\d+$/iu.test(cleaned)) return true;
  if (/^lugar\s+\d+$/iu.test(cleaned)) return true;
  if (/^álbum\s+\d+$/iu.test(cleaned)) return true;
  if (/^album\s+\d+$/iu.test(cleaned)) return true;
  if (/^grupo(\s+unido)?\s+\d+$/iu.test(cleaned)) return true;
  if (/^desconhecido$/iu.test(cleaned)) return true;
  if (/local desconhecido/iu.test(cleaned)) return true;
  if (/data e local desconhecidos/iu.test(cleaned)) return true;
  if (/^data\s+\d{4}-\d{2}-\d{2}/iu.test(cleaned)) return true;
  if (/^nova viagem$/iu.test(cleaned)) return true;
  return false;
}

/**
 * True when a future geocoding job may overwrite `places.name`.
 * User-confirmed non-generic names must never be replaced.
 */
export function canApplySuggestedPlaceName(place: {
  readonly name: string;
  readonly confirmedByUser: boolean;
}): boolean {
  if (!place.confirmedByUser) return true;
  return isGenericLocationLabel(place.name);
}

/**
 * Resolve the label shown in UI:
 * 1. User-confirmed place name
 * 2. Non-generic album name (rename)
 * 3. Automatic suggested place name (reverse geocoding)
 * 4. Fallback "Lugar N" / stored generic label (also accepts legacy "Local N")
 */
export function resolveLocationDisplayName(input: {
  readonly albumName: string;
  readonly placeName?: string | null;
  readonly placeConfirmedByUser?: boolean;
  readonly fallbackIndex?: number;
}): string {
  const place = input.placeName ? cleanLocationLabel(input.placeName) : "";
  const album = cleanLocationLabel(input.albumName);
  const confirmed = Boolean(input.placeConfirmedByUser);

  if (confirmed && place && !isGenericLocationLabel(place)) {
    return place;
  }

  if (album && !isGenericLocationLabel(album)) {
    return album;
  }

  if (place && !isGenericLocationLabel(place)) {
    return place;
  }

  if (album) return album;
  if (place) return place;
  return `Lugar ${input.fallbackIndex ?? 1}`;
}

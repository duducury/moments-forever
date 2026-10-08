/**
 * Browser-side generation of the share image: loads the real photos (small
 * thumbnails only, a handful at a time), the land shapes of the map and the
 * flags, then draws the canvas. Nothing here invents data.
 */

import { getOrCreateLocalPhotoObjectUrl } from "@/lib/local-photos/local-photo-object-url-cache";
import { mediaProxyUrl, isPersistedPhotoId } from "@/lib/media/media-url";
import { profileAvatarBlobId } from "@/lib/profile/profile-avatar-store";

import type { JourneySummary } from "./journey-summary";
import {
  JOURNEY_IMAGE_HEIGHT,
  JOURNEY_IMAGE_WIDTH,
  drawJourneyImage,
  planJourneyPins,
  type AdminGeoJson,
  type DrawableImage,
  type JourneyAssets,
  type LandGeoJson,
} from "./render-journey-image";

const IMAGE_TIMEOUT_MS = 9000;

function loadImage(url: string, crossOrigin = false): Promise<DrawableImage | null> {
  return new Promise((resolve) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = url;
  });
}

async function loadPhoto(photoId: string): Promise<DrawableImage | null> {
  const local = await getOrCreateLocalPhotoObjectUrl(photoId, "thumbnail").catch(() => null);
  if (local) {
    const image = await loadImage(local);
    if (image) return image;
  }
  return isPersistedPhotoId(photoId) ? loadImage(mediaProxyUrl(photoId, "thumbnail")) : null;
}

async function loadAvatar(ownerId: string, remoteSrc: string | null): Promise<DrawableImage | null> {
  const local = await getOrCreateLocalPhotoObjectUrl(profileAvatarBlobId(ownerId), "full").catch(() => null);
  if (local) {
    const image = await loadImage(local);
    if (image) return image;
  }
  return remoteSrc ? loadImage(remoteSrc) : null;
}

async function loadLand(): Promise<LandGeoJson | null> {
  try {
    const response = await fetch("/geo/land-v1.json");
    return response.ok ? ((await response.json()) as LandGeoJson) : null;
  } catch {
    return null;
  }
}

async function loadAdmin(): Promise<AdminGeoJson | null> {
  try {
    const response = await fetch("/geo/admin-v1.json");
    return response.ok ? ((await response.json()) as AdminGeoJson) : null;
  } catch {
    return null;
  }
}

/** Runs `task` over `items` with at most `limit` in flight. */
async function mapLimited<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await task(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function loadJourneyAssets(
  summary: JourneySummary,
  ownerId: string,
  avatarRemoteSrc: string | null,
): Promise<JourneyAssets> {
  // Only the photos of the pins that will actually be drawn.
  const pinPhotoIds = planJourneyPins(summary).pins.map((pin) => pin.cluster.photoId);
  const coverTrips = summary.favorites.filter((trip) => trip.coverPhotoId);
  const flagCodes = [
    ...new Set([...summary.countryCodes, ...summary.favorites.map((trip) => trip.countryCode).filter((c): c is string => Boolean(c))]),
  ];

  const [land, admin, avatar, covers, pins, flags] = await Promise.all([
    loadLand(),
    summary.region === "world" ? Promise.resolve(null) : loadAdmin(),
    loadAvatar(ownerId, avatarRemoteSrc),
    mapLimited(coverTrips, 4, async (trip) => [trip.albumId, await loadPhoto(trip.coverPhotoId!)] as const),
    mapLimited(pinPhotoIds, 4, async (id) => [id, await loadPhoto(id)] as const),
    mapLimited(flagCodes, 6, async (code) => [code, await loadImage(`https://flagcdn.com/w80/${code.toLowerCase()}.png`, true)] as const),
  ]);

  const keep = <K, V>(entries: readonly (readonly [K, V | null])[]) =>
    new Map(entries.filter((entry): entry is readonly [K, V] => entry[1] !== null));
  return { land, admin, avatar, covers: keep(covers), pins: keep(pins), flags: keep(flags) };
}

export function renderJourneyCanvas(summary: JourneySummary, assets: JourneyAssets): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = JOURNEY_IMAGE_WIDTH;
  canvas.height = JOURNEY_IMAGE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  drawJourneyImage(ctx, summary, assets);
  return canvas;
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem."))),
      "image/jpeg",
      0.92,
    );
  });
}

export async function generateJourneyImage(
  summary: JourneySummary,
  ownerId: string,
  avatarRemoteSrc: string | null,
): Promise<Blob> {
  const assets = await loadJourneyAssets(summary, ownerId, avatarRemoteSrc);
  // Let the loading state paint before the (synchronous) drawing starts.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return canvasToJpegBlob(renderJourneyCanvas(summary, assets));
}

/**
 * Square crop helpers for profile avatars (no external crop library).
 */

export interface SquareCropTransform {
  /** Zoom multiplier on top of cover-fit (≥ 1). */
  readonly scale: number;
  /** Pan in CSS pixels relative to the crop viewport center. */
  readonly offsetX: number;
  readonly offsetY: number;
}

export function coverFitScale(
  imageWidth: number,
  imageHeight: number,
  viewport: number,
): number {
  if (imageWidth <= 0 || imageHeight <= 0 || viewport <= 0) return 1;
  return Math.max(viewport / imageWidth, viewport / imageHeight);
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    image.src = src;
  });
}

/**
 * Rasterize the visible square crop into a JPEG blob.
 * `viewport` must match the on-screen crop stage size used for offsets.
 */
export async function exportSquareCrop(input: {
  readonly imageSrc: string;
  readonly viewport: number;
  readonly transform: SquareCropTransform;
  readonly outputSize?: number;
  readonly quality?: number;
}): Promise<Blob> {
  const image = await loadImageElement(input.imageSrc);
  const viewport = input.viewport;
  const outputSize = input.outputSize ?? 960;
  const quality = input.quality ?? 0.9;
  const base = coverFitScale(image.naturalWidth, image.naturalHeight, viewport);
  const displayScale = base * Math.max(1, input.transform.scale);
  const displayWidth = image.naturalWidth * displayScale;
  const displayHeight = image.naturalHeight * displayScale;

  // Top-left of the image in viewport coordinates (viewport center is 0,0 after offset).
  const imageLeft =
    viewport / 2 + input.transform.offsetX - displayWidth / 2;
  const imageTop =
    viewport / 2 + input.transform.offsetY - displayHeight / 2;

  // Viewport square in image natural pixels.
  const sx = (-imageLeft) / displayScale;
  const sy = (-imageTop) / displayScale;
  const sSize = viewport / displayScale;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas indisponível neste aparelho.");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sx,
    sy,
    sSize,
    sSize,
    0,
    0,
    outputSize,
    outputSize,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/jpeg", quality);
  });
  if (!blob) {
    throw new Error("Não foi possível gerar a foto recortada.");
  }
  return blob;
}

/**
 * Pure maths of the cover editor. A cover is an `object-fit: cover` photo whose
 * focus point (x%, y%) says which part of the photo sits at the same relative
 * place of the frame, and `zoom` enlarges the photo around that point (see
 * `coverImageStyle`). These helpers turn finger movements into a new
 * (x, y, zoom), keeping the photo always covering the frame — no empty edges,
 * no stretching.
 */

import { clampFocus, clampZoom, type CoverFocus } from "./cover-focus";

/** Real cover shape on the iPhone (profile trip cards): width : height = 4 : 5. */
export const COVER_ASPECT_WIDTH = 4;
export const COVER_ASPECT_HEIGHT = 5;

export interface CropFrame {
  readonly frameW: number;
  readonly frameH: number;
  readonly imageW: number;
  readonly imageH: number;
}

/** Size the photo is drawn at with `object-fit: cover` (zoom 1). */
export function coverSize(frame: CropFrame): { readonly w: number; readonly h: number } {
  const scale = Math.max(frame.frameW / frame.imageW, frame.frameH / frame.imageH);
  return { w: frame.imageW * scale, h: frame.imageH * scale };
}

/** Left (or top) edge of the zoomed photo, relative to the frame, for a focus percentage. */
function edge(focusPercent: number, frameSize: number, photoSize: number, zoom: number): number {
  return (focusPercent / 100) * (frameSize - zoom * photoSize);
}

/** Inverse of `edge`; null when the photo exactly fits the frame on this axis (nothing to move). */
function focusFromEdge(
  position: number,
  frameSize: number,
  photoSize: number,
  zoom: number,
): number | null {
  const room = frameSize - zoom * photoSize;
  if (Math.abs(room) < 1e-6) return null;
  return Math.min(100, Math.max(0, (position / room) * 100));
}

function build(x: number | null, fallbackX: number, y: number | null, fallbackY: number, zoom: number): CoverFocus {
  return clampFocus({ x: x ?? fallbackX, y: y ?? fallbackY, zoom });
}

/** The photo follows the finger: it moved `dx`/`dy` pixels from the given crop. */
export function panCrop(frame: CropFrame, crop: CoverFocus, dx: number, dy: number): CoverFocus {
  const { w, h } = coverSize(frame);
  const zoom = clampZoom(crop.zoom);
  const left = edge(crop.x, frame.frameW, w, zoom) + dx;
  const top = edge(crop.y, frame.frameH, h, zoom) + dy;
  return build(
    focusFromEdge(left, frame.frameW, w, zoom),
    crop.x,
    focusFromEdge(top, frame.frameH, h, zoom),
    crop.y,
    zoom,
  );
}

/**
 * Changes the zoom while the part of the photo under (`anchorX`, `anchorY`) —
 * pixels inside the frame, e.g. the pinch centre — stays under it.
 */
export function zoomCrop(
  frame: CropFrame,
  crop: CoverFocus,
  nextZoom: number,
  anchorX: number,
  anchorY: number,
): CoverFocus {
  const { w, h } = coverSize(frame);
  const zoom = clampZoom(crop.zoom);
  const next = clampZoom(nextZoom);
  const left = edge(crop.x, frame.frameW, w, zoom);
  const top = edge(crop.y, frame.frameH, h, zoom);
  // Fraction of the photo under the anchor, then where its edge must be at the new size.
  const u = (anchorX - left) / (zoom * w);
  const v = (anchorY - top) / (zoom * h);
  return build(
    focusFromEdge(anchorX - u * next * w, frame.frameW, w, next),
    crop.x,
    focusFromEdge(anchorY - v * next * h, frame.frameH, h, next),
    crop.y,
    next,
  );
}

/** The visible window as fractions (0…1) of the photo: what ends up inside the frame. */
export function visibleWindow(frame: CropFrame, crop: CoverFocus): { x0: number; y0: number; x1: number; y1: number } {
  const { w, h } = coverSize(frame);
  const zoom = clampZoom(crop.zoom);
  const left = edge(crop.x, frame.frameW, w, zoom);
  const top = edge(crop.y, frame.frameH, h, zoom);
  return {
    x0: -left / (zoom * w),
    y0: -top / (zoom * h),
    x1: (frame.frameW - left) / (zoom * w),
    y1: (frame.frameH - top) / (zoom * h),
  };
}
